/**
 * Honesty Store - Main Application Coordinator
 * Handles view switching, admin authentication, and global modal bindings
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Applications
  window.customerApp = new CustomerApp();
  window.adminApp = new AdminApp();

  const stage = document.getElementById('master-stage');
  const viewBtns = document.querySelectorAll('.view-btn');
  const adminAuthModal = document.getElementById('admin-auth-modal');
  let pendingAdminMode = null;

  function isAdminLoggedIn() {
    return localStorage.getItem('honesty_admin_auth') === 'true';
  }

  // Switch View Mode (Customer / Admin / Dual)
  function setViewMode(mode) {
    if ((mode === 'admin' || mode === 'dual') && !isAdminLoggedIn()) {
      pendingAdminMode = mode;
      if (adminAuthModal) adminAuthModal.classList.add('active');
      return;
    }

    stage.className = `master-stage mode-${mode}`;
    viewBtns.forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    localStorage.setItem('honesty_store_view_mode', mode);
  }

  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setViewMode(btn.dataset.mode);
    });
  });

  // Handle Admin Login Form
  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('admin-username-input')?.value.trim();
      const p = document.getElementById('admin-password-input')?.value.trim();
      const errEl = document.getElementById('admin-login-error');

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (data.success && data.adminToken) {
          localStorage.setItem('honesty_admin_token', data.adminToken);
          localStorage.setItem('honesty_admin_auth', 'true');
          if (errEl) errEl.style.display = 'none';
          if (adminAuthModal) adminAuthModal.classList.remove('active');
          const targetMode = pendingAdminMode || localStorage.getItem('honesty_store_view_mode') || 'admin';
          pendingAdminMode = null;
          setViewMode(targetMode);
          if (window.adminApp && typeof window.adminApp.render === 'function') {
            window.adminApp.render();
          }
          if (window.showToast) window.showToast('Admin Console unlocked.', 'success');
        } else {
          if (errEl) {
            errEl.style.display = 'block';
            errEl.innerText = data.message || 'Invalid username or password.';
          }
        }
      } catch (err) {
        // Fallback for offline mode if default credentials
        if (u === 'admin' && p === 'admin123') {
          localStorage.setItem('honesty_admin_auth', 'true');
          if (errEl) errEl.style.display = 'none';
          if (adminAuthModal) adminAuthModal.classList.remove('active');
          setViewMode('admin');
        } else {
          if (errEl) {
            errEl.style.display = 'block';
            errEl.innerText = 'Connection error. Please try again.';
          }
        }
      }
    });
  }

  // Handle Admin Logout button
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      localStorage.removeItem('honesty_admin_auth');
      localStorage.removeItem('honesty_admin_token');
      if (window.showToast) window.showToast('Admin Console has been locked.', 'info');
      setViewMode('customer');
    });
  }

  // Handle mobile shortcuts to Admin Console
  const btnHeaderAdmin = document.getElementById('btn-header-admin');
  if (btnHeaderAdmin) {
    btnHeaderAdmin.addEventListener('click', () => {
      setViewMode('admin');
    });
  }

  const btnSplashAdmin = document.getElementById('btn-splash-admin');
  if (btnSplashAdmin) {
    btnSplashAdmin.addEventListener('click', () => {
      setViewMode('admin');
    });
  }

  // Handle Switch to Customer Store button inside Admin
  const btnAdminSwitchStore = document.getElementById('btn-admin-switch-store');
  if (btnAdminSwitchStore) {
    btnAdminSwitchStore.addEventListener('click', () => {
      setViewMode('customer');
    });
  }

  // Load preferred mode or check URL parameters (e.g. ?view=admin)
  const urlParams = new URLSearchParams(window.location.search);
  let savedMode = localStorage.getItem('honesty_store_view_mode') || 'customer';
  if (urlParams.has('admin') || urlParams.get('view') === 'admin') {
    savedMode = 'admin';
  }

  if ((savedMode === 'admin' || savedMode === 'dual') && !isAdminLoggedIn()) {
    stage.className = 'master-stage mode-customer';
    viewBtns.forEach(btn => {
      if (btn.dataset.mode === 'customer') btn.classList.add('active');
      else btn.classList.remove('active');
    });
  } else {
    setViewMode(savedMode);
  }

  // Handle Cashfree redirect return_url (?order_id=...)
  if (urlParams.has('order_id')) {
    const returnOrderId = urlParams.get('order_id');
    console.log('[Cashfree Return URL]: Checking order', returnOrderId);
    fetch('/api/verify-cashfree-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: returnOrderId })
    }).then(r => r.json()).then(data => {
      if (data.isPaid && window.cashfreeClient) {
        window.cashfreeClient.handlePaymentSuccess(data.order || { id: returnOrderId, amount: data.orderAmount || 1, items: [] });
      }
    }).catch(e => console.warn('Return URL check warning:', e));
  }

  // Close modals when clicking overlay
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Modal Close buttons
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // Reset demo data button
  const btnReset = document.getElementById('btn-reset-demo');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Reset store data back to initial showcase values from screenshots?')) {
        window.storeDB.resetToDefault();
      }
    });
  }

  // Shelf Scanner simulation button inside scanner modal
  const btnSimulateScan = document.getElementById('btn-simulate-shelf-scan');
  if (btnSimulateScan) {
    btnSimulateScan.addEventListener('click', () => {
      if (window.customerApp && typeof window.customerApp.closeScannerModal === 'function') {
        window.customerApp.closeScannerModal();
      } else {
        const modal = document.getElementById('scanner-modal');
        if (modal) modal.classList.remove('active');
      }
      if (window.customerApp && typeof window.customerApp.switchScreen === 'function') {
        window.customerApp.switchScreen('screen-catalog');
        window.customerApp.playSuccessTone();
      }
      if (window.showToast) window.showToast('Shelf QR verified! Shelf unlocked.', 'success');
    });
  }
});
