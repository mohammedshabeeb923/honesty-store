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
    const phone = window.authManager.getUserPhone();
    const cart = window.storeDB.getCart();

    if (!cart || cart.length === 0) {
      if (window.showToast) window.showToast('Your tray is empty! Please add snacks or beverages before paying.', 'info');
      return;
    }

    const { total } = window.storeDB.getCartTotal();
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
      const response = await fetch('/api/create-cashfree-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          items: cart.map(i => ({ id: i.id, qty: i.qty })),
          orderAmount: total,
          customerPhone: phone,
          customerName: window.authManager.session.fullName || 'Honesty Customer'
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
      const verifyRes = await fetch('/api/verify-cashfree-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
}

window.cashfreeClient = new CashfreeClient();
