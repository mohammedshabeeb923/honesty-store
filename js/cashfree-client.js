/**
 * Honesty Store - Cashfree Payment Gateway Client SDK Integration
 * Production UPI, Dynamic QR, Netbanking, and Card checkout
 */

class CashfreeClient {
  constructor() {
    this.sdkLoaded = false;
    this.cashfree = null;
    this.loadSDK();
  }

  loadSDK() {
    if (window.Cashfree) {
      this.initCashfree();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => {
      this.initCashfree();
    };
    script.onerror = () => {
      console.warn('Cashfree SDK script failed to load from CDN.');
    };
    document.head.appendChild(script);
  }

  initCashfree() {
    try {
      const env = (window.AppConfig && window.AppConfig.cashfree && window.AppConfig.cashfree.environment) || 'PRODUCTION';
      const mode = env.toLowerCase() === 'production' ? 'production' : 'sandbox';
      if (typeof window.Cashfree === 'function') {
        this.cashfree = window.Cashfree({ mode });
        this.sdkLoaded = true;
        console.log('[Cashfree Client] SDK initialized in', mode, 'mode');
      }
    } catch (e) {
      console.warn('[Cashfree Client] Initialization warning:', e);
    }
  }

  async initiatePayment(orderData = {}) {
    const cart = window.storeDB.getCart();

    if (!cart || cart.length === 0) {
      if (window.showToast) window.showToast('Your tray is empty! Please add snacks or beverages before paying.', 'info');
      return;
    }

    const { total } = window.storeDB.getCartTotal();

    // Verify valid 10-digit Indian mobile number required by Cashfree PG & UPI
    const phone = window.authManager ? window.authManager.getUserPhone() : (localStorage.getItem('honesty_customer_phone') || '');
    const isValidPhone = Boolean(phone && /^[6-9]\d{9}$/.test(phone));
    const customerName = window.authManager ? window.authManager.getUserName() : (localStorage.getItem('honesty_customer_name') || '');
    const customerEmail = window.authManager ? window.authManager.getUserEmail() : (localStorage.getItem('honesty_customer_email') || '');

    // Prompt for details if phone is missing or if name is unknown
    if (!isValidPhone || (!customerName && !customerEmail)) {
      this.promptForPhone(orderData, total);
      return;
    }

    const orderId = orderData.id || `HS${Date.now().toString().slice(-6)}`;

    // Show loading indicator on Pay button
    const btnPay = document.getElementById('btn-cart-fullpage-pay');
    const originalText = btnPay ? btnPay.innerHTML : '';
    if (btnPay) {
      btnPay.innerText = 'Connecting to Cashfree Gateway...';
      btnPay.disabled = true;
    }

    try {
      // 1. Authoritative order initiation on backend with item validation & stock check
      const authToken = window.authManager ? window.authManager.getAccessToken() : '';
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (authToken) {
        reqHeaders['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch('/api/create-cashfree-order', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          orderId,
          items: cart.map(i => ({ id: i.id, qty: i.qty })),
          orderAmount: total,
          customerPhone: phone,
          customerEmail: customerEmail || '',
          customerName: customerName || `Customer ${phone}`,
          userId: window.authManager ? window.authManager.getUserId() : null
        })
      });

      const session = await response.json();

      if (!session.success) {
        throw new Error(session.error || 'Failed to initialize payment session');
      }

      // If Cashfree SDK is ready, launch standard Cashfree Checkout Modal
      if (session.paymentSessionId) {
        // Guarantee Cashfree SDK mode matches backend session environment exactly (prevents 'session invalid' error)
        const targetMode = (session.environment || 'PRODUCTION').toLowerCase() === 'production' ? 'production' : 'sandbox';
        if (typeof window.Cashfree === 'function') {
          this.cashfree = window.Cashfree({ mode: targetMode });
          this.sdkLoaded = true;
          console.log(`[Cashfree Client] Re-initialized SDK in ${targetMode} mode for session`);
        }

        if (this.cashfree) {
          const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
          const checkoutOptions = {
            paymentSessionId: session.paymentSessionId,
            redirectTarget: isMobile ? '_self' : '_modal'
          };

          this.cashfree.checkout(checkoutOptions).then(async (result) => {
            if (result && result.error) {
              if (window.showToast) window.showToast('Payment cancelled: ' + (result.error.message || 'Cancelled'), 'error');
              return;
            }

            // Verify payment server-side via GET /pg/orders/{order_id}
            await this.verifyAndCompletePayment(orderId, session.orderAmount || total, cart);
          }).catch(cErr => {
            console.warn('[Cashfree Checkout Catch]:', cErr);
          });
        } else {
          // If Cashfree JS SDK is blocked by browser, redirect to Cashfree checkout directly
          window.location.href = `https://payments.cashfree.com/order/#${session.paymentSessionId}`;
        }
      }
    } catch (err) {
      console.error('[Cashfree Checkout Error]:', err);
      if (window.showToast) window.showToast('Payment Notice: ' + err.message, 'error');
    } finally {
      if (btnPay) {
        btnPay.innerHTML = originalText || `PAY ₹${total} →`;
        btnPay.disabled = false;
      }
    }
  }

  async verifyAndCompletePayment(orderId, expectedAmount, fallbackItems) {
    try {
      const authToken = window.authManager ? window.authManager.getAccessToken() : '';
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (authToken) {
        reqHeaders['Authorization'] = `Bearer ${authToken}`;
      }

      const verifyRes = await fetch('/api/verify-cashfree-order', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ orderId })
      });
      const verifyData = await verifyRes.json();

      if (verifyData.success && verifyData.isPaid) {
        this.handlePaymentSuccess(verifyData.order || {
          id: orderId,
          amount: expectedAmount,
          items: fallbackItems,
          status: 'Paid',
          payment_method: 'Cashfree UPI'
        });
      } else {
        if (window.showToast) window.showToast(`Payment Status: ${verifyData.orderStatus || 'Pending'}. If deducted, your order will update shortly.`, 'info');
      }
    } catch (vErr) {
      console.warn('[Cashfree Client] Verification error:', vErr);
      if (window.showToast) window.showToast('Could not verify payment status with server. Please check your order history.', 'error');
    }
  }

  handlePaymentSuccess(order) {
    // 1. Record confirmed order in store database
    const confirmed = window.storeDB.recordConfirmedOrder(order);

    // 2. Synchronize store with Supabase
    window.storeDB.syncWithServer();

    // 3. Show Verified Screen in Customer Mobile App
    if (window.customerApp) {
      window.customerApp.showVerifiedScreen(confirmed);
    }
  }

  promptForPhone(orderData, total) {
    const modal = document.getElementById('phone-collection-modal');
    const form = document.getElementById('phone-collection-form');
    const inputPhone = document.getElementById('checkout-phone-input');
    const inputName = document.getElementById('checkout-name-input');
    const errEl = document.getElementById('phone-collection-error');
    const submitText = document.getElementById('phone-modal-submit-text');
    const btnCancel = document.getElementById('btn-cancel-phone-modal');

    if (!modal) {
      const prompted = window.prompt('Please enter your 10-digit Indian mobile number for Cashfree & UPI:');
      if (prompted && /^[6-9]\d{9}$/.test(prompted.replace(/\D/g, '').slice(-10))) {
        const clean = prompted.replace(/\D/g, '').slice(-10);
        if (window.authManager) window.authManager.setUserPhone(clean);
        else localStorage.setItem('honesty_customer_phone', clean);
        this.initiatePayment(orderData);
      }
      return;
    }

    if (inputPhone) {
      const existingPhone = window.authManager ? window.authManager.getUserPhone() : (localStorage.getItem('honesty_customer_phone') || '');
      inputPhone.value = existingPhone || '';
      setTimeout(() => inputPhone.focus(), 150);
    }

    if (inputName) {
      const existingName = window.authManager ? (window.authManager.getUserName() || window.authManager.getUserEmail()) : (localStorage.getItem('honesty_customer_name') || localStorage.getItem('honesty_customer_email') || '');
      if (existingName && !existingName.toLowerCase().includes('customer') && !existingName.toLowerCase().includes('honesty')) {
        inputName.value = existingName;
      }
    }

    if (errEl) errEl.style.display = 'none';
    if (submitText) submitText.innerText = `Confirm & Pay ₹${total} →`;

    if (btnCancel) {
      btnCancel.onclick = () => modal.classList.remove('active');
    }

    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const rawPhone = inputPhone ? inputPhone.value.trim() : '';
        const rawName = inputName ? inputName.value.trim() : '';
        const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

        if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
          if (errEl) {
            errEl.innerText = 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.';
            errEl.style.display = 'block';
          }
          return;
        }

        try {
          if (window.authManager && typeof window.authManager.setCustomerDetails === 'function') {
            window.authManager.setCustomerDetails(cleanPhone, rawName);
          } else {
            localStorage.setItem('honesty_customer_phone', cleanPhone);
            if (rawName) {
              if (rawName.includes('@')) {
                localStorage.setItem('honesty_customer_email', rawName.trim().toLowerCase());
                localStorage.setItem('honesty_customer_name', rawName.split('@')[0]);
              } else {
                localStorage.setItem('honesty_customer_name', rawName.trim());
              }
            }
          }
          modal.classList.remove('active');
          if (window.showToast) window.showToast(`Details saved for checkout.`, 'success');
          // Resume payment seamlessly
          this.initiatePayment(orderData);
        } catch (err) {
          if (errEl) {
            errEl.innerText = err.message;
            errEl.style.display = 'block';
          }
        }
      };
    }

    modal.classList.add('active');
  }
}

window.cashfreeClient = new CashfreeClient();
