/**
 * Honesty Store - Persistent Phone + Password / PIN Authentication Module
 * Replaces OTP with instant, permanent 4-digit PIN authentication
 */

class AuthManager {
  constructor() {
    this.storageKey = 'honesty_phone_session_v1';
    this.session = this.loadSession();
    this.currentView = 'signin';
    this.authCallback = null;
    this.initUI();
  }

  loadSession() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.isLoggedIn) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[AuthManager] Could not read auth session:', e);
    }
    return {
      isLoggedIn: false,
      phone: '',
      fullName: 'Honesty Shopper',
      token: null
    };
  }

  saveSession(sessionData) {
    this.session = {
      isLoggedIn: true,
      phone: sessionData.phone,
      fullName: sessionData.fullName || sessionData.name || 'Honesty Shopper',
      token: sessionData.token || ('token_' + Date.now())
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.session));
    } catch (e) {
      console.error('[AuthManager] Could not persist session:', e);
    }
    this.updateUI();
  }

  logout() {
    this.session = {
      isLoggedIn: false,
      phone: '',
      fullName: 'Honesty Shopper',
      token: null
    };
    localStorage.removeItem(this.storageKey);
    this.updateUI();
    this.switchView('signin');
    alert('You have logged out of this device.');
  }

  initUI() {
    document.addEventListener('DOMContentLoaded', () => {
      this.updateUI();
      this.bindEvents();
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    const signinView = document.getElementById('auth-view-signin');
    const signupView = document.getElementById('auth-view-signup');
    const profileView = document.getElementById('auth-step-profile');
    const errLogin = document.getElementById('login-error-msg');
    const errRegister = document.getElementById('register-error-msg');

    if (errLogin) errLogin.style.display = 'none';
    if (errRegister) errRegister.style.display = 'none';

    if (this.session.isLoggedIn) {
      if (signinView) signinView.style.display = 'none';
      if (signupView) signupView.style.display = 'none';
      if (profileView) profileView.style.display = 'block';
      return;
    }

    if (profileView) profileView.style.display = 'none';

    if (viewName === 'signup') {
      if (signinView) signinView.style.display = 'none';
      if (signupView) signupView.style.display = 'block';
    } else {
      if (signinView) signinView.style.display = 'block';
      if (signupView) signupView.style.display = 'none';
    }
  }

  bindEvents() {
    // Open Auth Modal from header avatar
    const avatarBtns = document.querySelectorAll('.header-avatar, .cart-avatar-wrap');
    avatarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.openAuthModal();
      });
    });

    // Customer Sign In Form Submit
    const signinForm = document.getElementById('customer-signin-form');
    if (signinForm) {
      signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = (document.getElementById('login-phone-input')?.value || '').trim();
        const password = (document.getElementById('login-password-input')?.value || '').trim();
        await this.login({ phone, password });
      });
    }

    // Customer Sign Up Form Submit
    const signupForm = document.getElementById('customer-signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('register-name-input')?.value || '').trim();
        const phone = (document.getElementById('register-phone-input')?.value || '').trim();
        const password = (document.getElementById('register-password-input')?.value || '').trim();
        await this.register({ name, phone, password });
      });
    }

    // Logout button in profile modal
    const btnLogout = document.getElementById('btn-auth-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        this.logout();
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.remove('active');
      });
    }
  }

  openAuthModal(options = {}) {
    this.authCallback = options.onSuccess || null;
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    if (this.session.isLoggedIn) {
      this.switchView('profile');
      const profPhone = document.getElementById('profile-modal-phone');
      if (profPhone) profPhone.innerText = `+91 ${this.session.phone}`;
      const profName = document.getElementById('profile-modal-name');
      if (profName) profName.innerText = this.session.fullName;
    } else {
      this.switchView(this.currentView || 'signin');
    }

    modal.classList.add('active');
  }

  async login({ phone, password }) {
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    const btnSubmit = document.getElementById('btn-login-submit');
    const errEl = document.getElementById('login-error-msg');

    if (errEl) errEl.style.display = 'none';

    if (cleanPhone.length !== 10) {
      this.showError(errEl, 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!password) {
      this.showError(errEl, 'Please enter your password or PIN.');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerText = 'Verifying PIN...';
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, password })
      });
      const data = await res.json();

      if (data.success) {
        this.saveSession({
          phone: data.phone,
          fullName: data.name,
          token: data.token
        });

        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.remove('active');

        if (typeof this.authCallback === 'function') {
          const cb = this.authCallback;
          this.authCallback = null;
          cb();
        }
      } else {
        this.showError(errEl, data.message || 'Invalid mobile number or PIN.');
      }
    } catch (err) {
      this.showError(errEl, 'Connection error. Please try again.');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Sign In →';
      }
    }
  }

  async register({ name, phone, password }) {
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    const cleanName = (name || '').trim();
    const btnSubmit = document.getElementById('btn-register-submit');
    const errEl = document.getElementById('register-error-msg');

    if (errEl) errEl.style.display = 'none';

    if (!cleanName) {
      this.showError(errEl, 'Please enter your full name.');
      return;
    }
    if (cleanPhone.length !== 10) {
      this.showError(errEl, 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!password || password.length < 4) {
      this.showError(errEl, 'Please choose a PIN or password of at least 4 digits.');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerText = 'Creating Profile...';
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, phone: cleanPhone, password })
      });
      const data = await res.json();

      if (data.success) {
        this.saveSession({
          phone: data.phone,
          fullName: data.name,
          token: data.token
        });

        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.remove('active');

        if (typeof this.authCallback === 'function') {
          const cb = this.authCallback;
          this.authCallback = null;
          cb();
        }
      } else {
        this.showError(errEl, data.message || 'Could not complete registration.');
      }
    } catch (err) {
      this.showError(errEl, 'Connection error. Please try again.');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Create Account & Enter →';
      }
    }
  }

  showError(el, msg) {
    if (el) {
      el.innerText = msg;
      el.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  updateUI() {
    const dot = document.getElementById('auth-status-dot');
    if (dot) {
      if (this.session.isLoggedIn) {
        dot.style.background = '#10b981'; // green
        dot.title = `Logged in as ${this.session.fullName} (+91 ${this.session.phone})`;
      } else {
        dot.style.background = '#94a3b8'; // grey
        dot.title = 'Not logged in. Click to authenticate.';
      }
    }

    const profName = document.getElementById('profile-modal-name');
    if (profName) profName.innerText = this.session.fullName || 'Verified Customer';

    const profPhone = document.getElementById('profile-modal-phone');
    if (profPhone) profPhone.innerText = this.session.isLoggedIn ? `+91 ${this.session.phone}` : '+91 98765 43210';

    const authStatusBadges = document.querySelectorAll('.auth-user-status');
    authStatusBadges.forEach(el => {
      if (this.session.isLoggedIn) {
        el.innerText = this.session.fullName || `+91 ${this.session.phone}`;
        el.title = `Signed in as ${this.session.fullName} (+91 ${this.session.phone})`;
      } else {
        el.innerText = 'Sign In';
      }
    });
  }

  getUserPhone() {
    return this.session.isLoggedIn ? `+91${this.session.phone}` : '+919876543210';
  }
}

window.authManager = new AuthManager();
