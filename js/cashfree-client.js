/**
 * Honesty Store - Cashfree Payment Gateway Client SDK Integration
 * Supports UPI Intent, Dynamic QR, Netbanking, and Cards
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
      console.warn('Cashfree SDK script failed to load, falling back to embedded modal.');
    };
    document.head.appendChild(script);
  }

  initCashfree() {
    try {
      const mode = window.AppConfig.cashfree.environment === 'PRODUCTION' ? 'production' : 'sandbox';
      this.cashfree = window.Cashfree({ mode });
      this.sdkLoaded = true;
      console.log('Cashfree SDK initialized in', mode, 'mode');
    } catch (e) {
      console.warn('Cashfree initialization warning:', e);
    }
  }

  async initiatePayment(orderData) {
    const phone = window.authManager.getUserPhone();
    const amount = orderData.amount;
    const orderId = orderData.id || `HS${Date.now().toString().slice(-6)}`;

    // Show loading indicator
    const btnPay = document.getElementById('btn-cart-fullpage-pay');
    if (btnPay) {
      btnPay.innerText = 'Connecting to Cashfree UPI...';
      btnPay.disabled = true;
    }

    try {
      // 1. Request Payment Session ID from backend
      const response = await fetch('/api/create-cashfree-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          orderAmount: amount,
          customerPhone: phone,
          customerName: window.authManager.session.fullName || 'Honesty Customer'
        })
      });

      const session = await response.json();

      // If Cashfree credentials are live and SDK is loaded
      if (session.paymentSessionId && this.cashfree) {
        const checkoutOptions = {
          paymentSessionId: session.paymentSessionId,
          redirectTarget: '_modal'
        };

        this.cashfree.checkout(checkoutOptions).then((result) => {
          if (result.error) {
            alert('Payment could not be completed: ' + result.error.message);
          }
          if (result.paymentDetails) {
            this.handlePaymentSuccess(orderId, amount, 'Cashfree UPI');
          }
        });
      } else {
        // Embedded Cashfree UPI Simulator Modal (Full Gateway UI)
        this.openCashfreeSimulatorModal(orderId, amount, phone);
      }
    } catch (err) {
      console.warn('Cashfree API error, opening simulator:', err);
      this.openCashfreeSimulatorModal(orderId, amount, phone);
    } finally {
      if (btnPay) {
        btnPay.innerText = `PAY ₹${amount} →`;
        btnPay.disabled = false;
      }
    }
  }

  openCashfreeSimulatorModal(orderId, amount, phone) {
    const modal = document.getElementById('cashfree-gateway-modal');
    if (!modal) return;

    document.getElementById('cf-order-id-display').innerText = orderId;
    document.getElementById('cf-amount-display').innerText = `₹${amount}`;
    document.getElementById('cf-phone-display').innerText = phone;

    modal.classList.add('active');
  }

  handlePaymentSuccess(orderId, amount, method = 'Cashfree UPI') {
    // Close simulator if open
    const modal = document.getElementById('cashfree-gateway-modal');
    if (modal) modal.classList.remove('active');

    // Process order in StoreDB & Supabase
    window.customerApp.confirmPayment(method);
  }
}

window.cashfreeClient = new CashfreeClient();
