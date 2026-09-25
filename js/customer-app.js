/**
 * Customer Mobile Application Controller
 */

class CustomerApp {
  constructor() {
    this.currentScreen = 'screen-splash';
    this.activeCategory = 'All';
    this.initElements();
    this.bindEvents();
    this.subscribeToStore();
    this.renderCatalog();
    this.renderOrders();
    this.renderCommunity();
    this.updateCartUI();
  }

  initElements() {
    this.screens = {
      splash: document.getElementById('screen-splash'),
      catalog: document.getElementById('screen-catalog'),
      cart: document.getElementById('screen-cart'),
      verified: document.getElementById('screen-verified'),
      orders: document.getElementById('screen-orders'),
      honesty: document.getElementById('screen-honesty')
    };

    this.navTabs = document.querySelectorAll('.nav-tab-item');
    this.cartDrawer = document.getElementById('cart-drawer');
    this.cartItemsList = document.getElementById('cart-items-list');
    this.cartTotalAmount = document.getElementById('cart-total-amount');
    this.cartBadge = document.getElementById('cart-nav-badge');
    this.productsGrid = document.getElementById('products-grid');
    this.categoryChips = document.querySelectorAll('.category-chip');

    // Fullpage Cart Elements
    this.cartFullItemsList = document.getElementById('cart-fullpage-items-list');
    this.cartFullSubtotal = document.getElementById('cart-fullpage-subtotal');
    this.cartFullTotal = document.getElementById('cart-fullpage-total');
    this.cartPayBtn = document.getElementById('btn-cart-fullpage-pay');
  }

  bindEvents() {
    // Enter Store from splash - Enforces Persistent Phone Authentication
    const btnEnter = document.getElementById('btn-enter-store');
    if (btnEnter) {
      btnEnter.addEventListener('click', () => {
        window.storeDB.logVisit();

        // Check if persistent phone login exists
        if (window.authManager && window.authManager.session.isLoggedIn) {
          // Already persistently authenticated!
          this.switchScreen('screen-catalog');
        } else {
          // Require Phone OTP Login to enter the store
          window.authManager.openAuthModal({
            onSuccess: () => {
              this.switchScreen('screen-catalog');
            }
          });
        }
      });
    }

    // Stepper Scan click (Interactive Shelf QR Scanner)
    const scanStep = document.getElementById('step-scan-shelf');
    if (scanStep) {
      scanStep.addEventListener('click', () => {
        this.openScannerModal();
      });
    }

    // Category chips
    this.categoryChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.categoryChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCategory = chip.dataset.category || 'All';
        this.renderCatalog();
      });
    });

    // Bottom Navigation
    this.navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = tab.dataset.target;
        if (target === 'cart') {
          this.renderFullCart();
          this.switchScreen('screen-cart');
        } else {
          this.navTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.switchScreen(target);
        }
      });
    });

    // Back button in fullpage Cart
    const btnCartBack = document.getElementById('btn-cart-back');
    if (btnCartBack) {
      btnCartBack.addEventListener('click', () => {
        this.switchScreen('screen-catalog');
      });
    }

    // Fullpage Cart Pay Button
    if (this.cartPayBtn) {
      this.cartPayBtn.addEventListener('click', () => {
        const { total } = window.storeDB.getCartTotal();
        if (total <= 0) return;

        // If not logged in, prompt Phone Auth first for persistent receipt tracking
        if (!window.authManager.session.isLoggedIn) {
          window.authManager.openAuthModal();
        } else {
          // Launch Cashfree Payment Gateway
          window.cashfreeClient.initiatePayment({ amount: total });
        }
      });
    }

    // Done button on Verified Screen
    const btnVerifiedDone = document.getElementById('btn-verified-done');
    if (btnVerifiedDone) {
      btnVerifiedDone.addEventListener('click', () => {
        this.switchScreen('screen-orders');
      });
    }

    // Cart Close Button in Drawer
    const btnCloseCart = document.getElementById('btn-close-cart');
    if (btnCloseCart) {
      btnCloseCart.addEventListener('click', () => this.toggleCartDrawer(false));
    }

    // Checkout Trigger from Drawer
    const btnPayNow = document.getElementById('btn-pay-now');
    if (btnPayNow) {
      btnPayNow.addEventListener('click', () => {
        this.openPaymentModal();
      });
    }

    // Pledge Button in Our Honesty screen
    const btnPledge = document.getElementById('btn-sign-pledge');
    if (btnPledge) {
      btnPledge.addEventListener('click', () => {
        window.storeDB.signHonorPledge();
        btnPledge.innerText = '✓ Honor Pledge Signed!';
        btnPledge.style.background = '#0ca678';
        btnPledge.style.color = '#ffffff';
        alert('Thank you for upholding community trust! Your pledge makes this store possible.');
      });
    }
  }

  subscribeToStore() {
    window.storeDB.subscribe((data) => {
      this.renderCatalog();
      this.renderFullCart();
      this.renderOrders();
      this.renderCommunity();
      this.updateCartUI();
    });
  }

  switchScreen(screenId) {
    this.currentScreen = screenId;
    Object.values(this.screens).forEach(screen => {
      if (screen) screen.classList.remove('active');
    });

    const activeEl = document.getElementById(screenId);
    if (activeEl) {
      activeEl.classList.add('active');
    }

    // Update bottom nav highlighting
    this.navTabs.forEach(tab => {
      if (tab.dataset.target === screenId || (screenId === 'screen-cart' && tab.dataset.target === 'cart')) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Show or hide header and bottom nav based on screen
    const bottomNav = document.getElementById('mobile-bottom-nav');
    const appHeader = document.getElementById('mobile-app-header');

    if (screenId === 'screen-splash' || screenId === 'screen-cart' || screenId === 'screen-verified') {
      if (appHeader) appHeader.style.display = 'none';
    } else {
      if (appHeader) appHeader.style.display = 'flex';
    }

    if (screenId === 'screen-splash' || screenId === 'screen-verified') {
      if (bottomNav) bottomNav.style.display = 'none';
    } else {
      if (bottomNav) bottomNav.style.display = 'flex';
    }
  }

  renderCatalog() {
    if (!this.productsGrid) return;
    const products = window.storeDB.getProducts(this.activeCategory);
    const cart = window.storeDB.getCart() || [];

    this.productsGrid.innerHTML = products.map(prod => {
      const isOutOfStock = prod.stock <= 0;
      const isLowStock = prod.stock > 0 && prod.stock <= (prod.lowStockThreshold || 5);
      const cartItem = cart.find(i => i.id === prod.id);
      const cartQty = cartItem ? cartItem.qty : 0;

      return `
        <div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" data-id="${prod.id}">
          <div class="card-img-wrap">
            ${isLowStock ? '<span class="badge-low-stock">LOW STOCK</span>' : ''}
            <img src="${prod.image}" alt="${prod.name}" />
          </div>
          <div class="product-name">${prod.name}</div>
          <div class="product-stock-line ${isLowStock ? 'warning' : ''}">
            ${isLowStock ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:-1px; margin-right:3px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : ''}${prod.stock} IN STOCK
          </div>
          <div class="product-bottom-row">
            <div class="product-price">₹${prod.price}</div>
            ${cartQty > 0 ? `
              <div class="product-stepper">
                <button class="stepper-btn minus" onclick="window.customerApp.reduceCartItem('${prod.id}')" title="Reduce quantity">
                  −
                </button>
                <span class="stepper-count">${cartQty}</span>
                <button class="stepper-btn plus" onclick="window.customerApp.addToCart('${prod.id}')" title="Add one more">+</button>
              </div>
            ` : `
              <button class="btn-add-item ${isOutOfStock ? 'disabled' : ''}" 
                      onclick="window.customerApp.addToCart('${prod.id}')"
                      ${isOutOfStock ? 'disabled title="Out of stock"' : 'title="Add to cart"'}>
                ${isOutOfStock ? '⊘' : '+'}
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  addToCart(productId) {
    const success = window.storeDB.addToCart(productId);
    if (!success) {
      alert('This item is currently out of stock or max inventory reached!');
      return;
    }
    // Haptic / visual feedback
    this.playChime();
    this.updateCartUI();
    this.renderCatalog();
    this.renderFullCart();
  }

  reduceCartItem(productId) {
    window.storeDB.updateCartQty(productId, -1);
    this.updateCartUI();
    this.renderCatalog();
    this.renderFullCart();
  }

  increaseCartItem(productId) {
    this.addToCart(productId);
  }

  removeCartItem(productId) {
    window.storeDB.updateCartQty(productId, -999);
    this.updateCartUI();
    this.renderCatalog();
    this.renderFullCart();
  }

  updateCartUI() {
    const cart = window.storeDB.getCart();
    const { total, count } = window.storeDB.getCartTotal();

    if (this.cartBadge) {
      this.cartBadge.innerText = count;
      this.cartBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    if (this.cartTotalAmount) {
      this.cartTotalAmount.innerText = `₹${total}`;
    }

    if (this.cartItemsList) {
      if (cart.length === 0) {
        this.cartItemsList.innerHTML = `
          <div style="text-align:center; padding: 30px 10px; color: #94a3b8;">
            <div style="margin-bottom: 8px; display: flex; justify-content: center;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.7"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <p style="font-size: 14px; font-weight: 600;">Your cart is empty</p>
            <p style="font-size: 12px; margin-top: 4px;">Pick snacks from the shelf to begin</p>
          </div>
        `;
      } else {
        this.cartItemsList.innerHTML = cart.map(item => `
          <div class="cart-row-item">
            <div class="cart-item-info">
              <img src="${item.image}" class="cart-item-img" alt="${item.name}" />
              <div class="cart-item-text">
                <h4>${item.name}</h4>
                <p>₹${item.price} each</p>
              </div>
            </div>
            <div class="cart-qty-ctrls">
              <button class="qty-btn" onclick="window.customerApp.reduceCartItem('${item.id}')" title="Reduce quantity">−</button>
              <span style="font-weight: 700; font-size: 14px; min-width: 16px; text-align: center;">${item.qty}</span>
              <button class="qty-btn" onclick="window.customerApp.increaseCartItem('${item.id}')" title="Add one more">+</button>
              <div style="font-weight: 800; font-size: 14px; margin-left: 8px;">₹${item.price * item.qty}</div>
            </div>
          </div>
        `).join('');
      }
    }
  }

  toggleCartDrawer(open) {
    if (!this.cartDrawer) return;
    if (open) {
      this.cartDrawer.classList.add('open');
    } else {
      this.cartDrawer.classList.remove('open');
    }
  }

  renderOrders() {
    const listEl = document.getElementById('orders-history-list');
    if (!listEl) return;

    const orders = window.storeDB.data.orders;
    listEl.innerHTML = orders.map(order => `
      <div class="order-history-card" onclick="window.customerApp.viewReceipt('${order.id}')">
        <div class="order-card-meta">
          <div class="order-date-label">${order.timeLabel}</div>
          <div class="order-code-title">Order ${order.id}</div>
          <div class="order-status-row">
            <span class="badge-paid">✓ ${order.status}</span>
            <span class="order-items-count">${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'}</span>
          </div>
        </div>
        <div class="order-card-amount">₹${order.amount}</div>
      </div>
    `).join('');
  }

  renderCommunity() {
    const comm = window.storeDB.data.community;
    const salesEl = document.getElementById('community-sales-today');
    const visitsEl = document.getElementById('community-visits-count');
    const paymentsEl = document.getElementById('community-payments-count');

    if (salesEl) salesEl.innerText = `₹${comm.salesToday.toLocaleString('en-IN')}`;
    if (visitsEl) visitsEl.innerText = comm.storeVisits;
    if (paymentsEl) paymentsEl.innerText = comm.completedPayments;
  }

  openPaymentModal() {
    const { total, count } = window.storeDB.getCartTotal();
    if (total <= 0) {
      alert('Please add items to your cart first!');
      return;
    }

    const modal = document.getElementById('payment-modal');
    const amountSpan = document.getElementById('pay-modal-amount');
    if (amountSpan) amountSpan.innerText = `₹${total}`;
    if (modal) modal.classList.add('active');
  }

  renderFullCart() {
    if (!this.cartFullItemsList) return;
    const cart = window.storeDB.getCart();
    const { total, count } = window.storeDB.getCartTotal();

    if (cart.length === 0) {
      this.cartFullItemsList.innerHTML = `
        <div style="text-align:center; padding: 40px 10px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #f8fafc; border: 1px solid #edf2f7; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">Your cart is waiting</h3>
          <p style="font-size: 13px; color: #64748b; margin-bottom: 20px;">Discover fresh snacks and beverages in the store.</p>
          <button onclick="window.customerApp.switchScreen('screen-catalog')" 
                  style="background: #000; color: #fff; border:none; padding: 10px 24px; border-radius: 20px; font-weight: 700; cursor: pointer;">
            Start Shopping
          </button>
        </div>
      `;
      if (this.cartFullSubtotal) this.cartFullSubtotal.innerText = '₹0';
      if (this.cartFullTotal) this.cartFullTotal.innerText = '₹0';
      if (this.cartPayBtn) {
        this.cartPayBtn.style.display = 'none';
      }
      return;
    }

    if (this.cartPayBtn) {
      this.cartPayBtn.style.display = 'flex';
      this.cartPayBtn.innerHTML = `PAY ₹${total} <span style="font-size: 16px;">→</span>`;
    }

    if (this.cartFullSubtotal) this.cartFullSubtotal.innerText = `₹${total}`;
    if (this.cartFullTotal) this.cartFullTotal.innerText = `₹${total}`;

    this.cartFullItemsList.innerHTML = cart.map(item => `
      <div class="cart-item-card">
        <div class="cart-item-card-left">
          <div class="cart-item-card-thumb">
            <img src="${item.image}" alt="${item.name}" />
          </div>
          <div class="cart-item-card-meta">
            <h4>${item.name}</h4>
            <p>₹${item.price} each</p>
          </div>
        </div>
        <div class="cart-item-card-right" style="display: flex; align-items: center; gap: 8px;">
          <div class="cart-qty-pill">
            <button class="cart-qty-btn minus" onclick="window.reduceCartItem('${item.id}')" title="Reduce quantity">
              −
            </button>
            <span class="cart-qty-val">${item.qty}</span>
            <button class="cart-qty-btn plus" onclick="window.increaseCartItem('${item.id}')" title="Add one more">
              +
            </button>
          </div>
          <button class="cart-del-btn" onclick="window.removeCartItem('${item.id}')" title="Remove from tray" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #fee2e2; background: #fff1f2; color: #dc2626; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
          <div class="cart-item-card-price" style="min-width: 50px; text-align: right;">₹${item.price * item.qty}</div>
        </div>
      </div>
    `).join('');
  }

  confirmPayment(method = 'UPI') {
    if (method.includes('Cashfree') || method === 'UPI') {
      const payModal = document.getElementById('payment-modal');
      if (payModal) payModal.classList.remove('active');
      this.toggleCartDrawer(false);
      window.cashfreeClient.initiatePayment();
      return;
    }

    const { total } = window.storeDB.getCartTotal();
    if (total <= 0) return;
    const cart = window.storeDB.getCart();

    const newOrder = {
      id: `HS${Date.now().toString().slice(-6)}`,
      amount: total,
      itemCount: cart.reduce((s, i) => s + i.qty, 0),
      items: JSON.parse(JSON.stringify(cart)),
      status: 'Paid',
      payment_method: method
    };

    const confirmed = window.storeDB.recordConfirmedOrder(newOrder);
    this.showVerifiedScreen(confirmed);
  }

  showVerifiedScreen(order) {
    if (!order) return;

    const payModal = document.getElementById('payment-modal');
    if (payModal) payModal.classList.remove('active');
    this.toggleCartDrawer(false);

    // Populate Verified Screen (Matches media_1788895850084.jpg)
    const verifiedAmount = document.getElementById('verified-amount-val');
    const verifiedOrderNo = document.getElementById('verified-order-no');
    const verifiedItemsList = document.getElementById('verified-items-list-container');

    if (verifiedAmount) verifiedAmount.innerText = `₹${order.amount}`;
    if (verifiedOrderNo) verifiedOrderNo.innerText = `#${order.id}`;

    if (verifiedItemsList && Array.isArray(order.items)) {
      verifiedItemsList.innerHTML = order.items.map(item => `
        <div class="verified-item-row">
          <span>${item.name}</span>
          <span class="verified-item-qty">x${item.qty}</span>
        </div>
      `).join('');
    }

    this.switchScreen('screen-verified');
    this.playSuccessTone();
    this.updateCartUI();
    this.renderCatalog();
    this.renderFullCart();
    this.renderOrders();
  }


  viewReceipt(orderId) {
    const order = window.storeDB.data.orders.find(o => o.id === orderId);
    if (!order) return;

    const receiptModal = document.getElementById('receipt-modal');
    const receiptContent = document.getElementById('receipt-modal-body');

    if (receiptContent) {
      receiptContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-size: 13px; color: #64748b;">${order.timeLabel}</div>
          <h3 style="font-size: 20px; font-weight: 800; margin: 4px 0;">Order ${order.id}</h3>
          <span class="badge-paid" style="display:inline-flex; margin-top: 4px;">✓ Verified Honor Payment</span>
        </div>
        <div style="border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; padding: 14px 0; margin: 14px 0;">
          ${order.items.map(item => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
              <span>${item.qty}x ${item.name}</span>
              <span style="font-weight: 700;">₹${item.price * item.qty}</span>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 17px; font-weight: 800;">
          <span>Total Paid</span>
          <span>₹${order.amount}</span>
        </div>
        <div style="text-align: center; font-size: 11px; color: #64748b; margin-top: 16px;">
          "Take what you need. Pay what you take."<br/>Thank you for your honesty!
        </div>
      `;
    }
    if (receiptModal) receiptModal.classList.add('active');
  }

  openScannerModal() {
    const scannerModal = document.getElementById('scanner-modal');
    if (scannerModal) scannerModal.classList.add('active');
  }

  playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }

  playSuccessTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.08 + 0.2);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.22);
      });
    } catch(e) {}
  }
}

window.CustomerApp = CustomerApp;

// Global Cart Actions
window.reduceCartItem = function(productId) {
  if (window.customerApp) {
    window.customerApp.reduceCartItem(productId);
  } else if (window.storeDB) {
    window.storeDB.updateCartQty(productId, -1);
  }
};

window.increaseCartItem = function(productId) {
  if (window.customerApp) {
    window.customerApp.addToCart(productId);
  } else if (window.storeDB) {
    window.storeDB.addToCart(productId);
  }
};

window.removeCartItem = function(productId) {
  if (window.customerApp) {
    window.customerApp.removeCartItem(productId);
  } else if (window.storeDB) {
    window.storeDB.updateCartQty(productId, -999);
  }
};

window.clearTray = function() {
  if (window.storeDB) {
    window.storeDB.clearCart();
  }
  if (window.customerApp) {
    window.customerApp.updateCartUI();
    window.customerApp.renderCatalog();
    window.customerApp.renderFullCart();
  }
};
