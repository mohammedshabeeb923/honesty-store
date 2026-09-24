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
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('admin-username-input')?.value.trim();
      const p = document.getElementById('admin-password-input')?.value.trim();
      const errEl = document.getElementById('admin-login-error');

      if (u === 'admin' && p === 'admin123') {
        localStorage.setItem('honesty_admin_auth', 'true');
        if (errEl) errEl.style.display = 'none';
        if (adminAuthModal) adminAuthModal.classList.remove('active');
        const targetMode = pendingAdminMode || localStorage.getItem('honesty_store_view_mode') || 'admin';
        pendingAdminMode = null;
        setViewMode(targetMode);
      } else {
        if (errEl) {
          errEl.style.display = 'block';
          errEl.innerText = 'Invalid username or password. Default is admin / admin123';
        }
      }
    });
  }

  // Handle Admin Logout button
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      localStorage.removeItem('honesty_admin_auth');
      alert('Admin Console has been locked.');
      setViewMode('customer');
    });
  }

  // Load preferred mode or default to customer for authentic customer-first experience
  const savedMode = localStorage.getItem('honesty_store_view_mode') || 'customer';
  if ((savedMode === 'admin' || savedMode === 'dual') && !isAdminLoggedIn()) {
    stage.className = 'master-stage mode-customer';
    viewBtns.forEach(btn => {
      if (btn.dataset.mode === 'customer') btn.classList.add('active');
      else btn.classList.remove('active');
    });
  } else {
    setViewMode(savedMode);
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
      const modal = document.getElementById('scanner-modal');
      if (modal) modal.classList.remove('active');
      window.customerApp.switchScreen('screen-catalog');
      window.customerApp.playSuccessTone();
    });
  }
});
