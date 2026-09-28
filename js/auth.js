/**
 * Honesty Store - Supabase Google OAuth Authentication Module
 * Manages user sessions, Google OAuth sign-in, RLS identity, and Admin authorization.
 */

class AuthManager {
  constructor() {
    this.user = null;
    this.session = null;
    this.isLoggedIn = false;
    this.isAdminUser = false;
    this.authCallback = null;
    this.isInitialized = false;

    // Immediately restore persistent session from localStorage for instant, zero-flicker UI
    this.restorePersistentSession();

    this.init();
  }

  restorePersistentSession() {
    try {
      const cached = JSON.parse(localStorage.getItem('honesty_customer_user') || 'null');
      const savedPhone = localStorage.getItem('honesty_customer_phone') || '';
      if (cached && (cached.id || cached.email)) {
        this.user = cached;
        if (savedPhone && !this.user.phone) {
          this.user.phone = savedPhone;
        }
        this.isLoggedIn = true;
        this.isAdminUser = localStorage.getItem('honesty_admin_auth') === 'true';
        console.log('[AuthManager] Restored persistent session for:', this.user.fullName || this.user.email);
      } else if (savedPhone) {
        this.user = { id: null, email: '', fullName: 'Honesty Customer', phone: savedPhone };
      }
    } catch (e) {
      console.warn('[AuthManager] Session restore warning:', e);
    }
  }

  async init() {
    // Wait for Supabase Client SDK
    this.pollForSupabase();
  }

  pollForSupabase(attempts = 0) {
    if (window.supabaseClient && window.supabaseClient.client) {
      this.setupAuthListener();
      this.checkCurrentSession();
      this.bindDOM();
    } else if (attempts < 30) {
      setTimeout(() => this.pollForSupabase(attempts + 1), 100);
    } else {
      console.warn('[AuthManager] Supabase Client could not be found after 3 seconds.');
      this.bindDOM();
    }
  }

  setupAuthListener() {
    if (!window.supabaseClient || !window.supabaseClient.client) return;

    window.supabaseClient.onAuthStateChange(async (event, session) => {
      console.log('[AuthManager] Supabase Auth State Change:', event, session?.user?.email);
      this.session = session;
      if (session && session.user) {
        await this.handleUserSignedIn(session.user);
      } else {
        this.handleUserSignedOut();
      }
    });
  }

  async checkCurrentSession() {
    if (!window.supabaseClient) return;
    try {
      const session = await window.supabaseClient.getSession();
      if (session && session.user) {
        this.session = session;
        await this.handleUserSignedIn(session.user);
      } else {
        // If Supabase confirms no active server session, clear persistent storage
        if (this.isLoggedIn && !this.session) {
          this.handleUserSignedOut();
        }
      }
    } catch (e) {
      console.warn('[AuthManager] Error checking current session:', e);
    } finally {
      this.isInitialized = true;
    }
  }

  async handleUserSignedIn(authUser) {
    this.isLoggedIn = true;
    const meta = authUser.user_metadata || {};
    const fullName = meta.full_name || meta.name || authUser.email?.split('@')[0] || 'Honesty Shopper';
    const avatarUrl = meta.avatar_url || meta.picture || 'assets/avatar.png';
    const savedPhone = localStorage.getItem('honesty_customer_phone') || '';
    const phone = authUser.phone || meta.phone || savedPhone || '';

    this.user = {
      id: authUser.id,
      email: authUser.email || '',
      fullName,
      avatarUrl,
      phone
    };

    // Persist session to localStorage across reloads and tab closures
    try {
      localStorage.setItem('honesty_customer_user', JSON.stringify(this.user));
      if (phone) {
        localStorage.setItem('honesty_customer_phone', phone);
      }
    } catch (e) {}

    // Verify Admin Status
    this.isAdminUser = await window.supabaseClient.checkIsAdmin(authUser);
    if (this.isAdminUser) {
      localStorage.setItem('honesty_admin_auth', 'true');
    }

    this.updateUI();

    // Trigger user-specific order load in storeDB
    if (window.storeDB && typeof window.storeDB.loadUserOrders === 'function') {
      window.storeDB.loadUserOrders(authUser.id);
    }

    // Auto-advance screen from splash when customer signs in
    if (window.customerApp && window.customerApp.currentScreen === 'screen-splash') {
      window.customerApp.switchScreen('screen-catalog');
    }

    // Execute callback if pending
    if (typeof this.authCallback === 'function') {
      const cb = this.authCallback;
      this.authCallback = null;
      cb(this.user);
    }
  }

  handleUserSignedOut() {
    this.isLoggedIn = false;
    this.isAdminUser = false;
    this.user = null;
    this.session = null;
    localStorage.removeItem('honesty_customer_user');
    localStorage.removeItem('honesty_admin_auth');
    localStorage.removeItem('honesty_admin_token');

    this.updateUI();

    // Clear user-specific orders
    if (window.storeDB && typeof window.storeDB.clearUserOrders === 'function') {
      window.storeDB.clearUserOrders();
    }
  }

  // ============================================================
  // AUTH ACTIONS: GOOGLE LOGIN, LOGOUT
  // ============================================================

  async loginWithGoogle() {
    const errEl = document.getElementById('login-error-msg');
    const btnSubmit = document.getElementById('btn-google-signin');

    if (errEl) errEl.style.display = 'none';
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.style.opacity = '0.7';
    }

    try {
      if (!window.supabaseClient || !window.supabaseClient.isConnected) {
        throw new Error('Supabase is not connected. Please check configuration.');
      }
      await window.supabaseClient.signInWithGoogle();
    } catch (err) {
      console.error('[AuthManager] Google Sign In Failed:', err);
      const msg = err.message && err.message.toLowerCase().includes('provider')
        ? 'Google Sign-In is not enabled yet in your Supabase Dashboard. Please enable the Google provider under Authentication > Providers in Supabase.'
        : (err.message || 'Could not initiate Google sign in. Please try again.');
      
      if (errEl) {
        errEl.innerText = msg;
        errEl.style.display = 'block';
      } else if (window.showToast) {
        window.showToast(msg, 'error');
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
      }
    }
  }

  async adminLoginWithGoogle() {
    const errEl = document.getElementById('admin-login-error');
    const btnSubmit = document.getElementById('btn-admin-google-signin');

    if (errEl) errEl.style.display = 'none';

    // If already logged in, check if current user is admin
    if (this.isLoggedIn && this.user) {
      const isAuthAdmin = await window.supabaseClient.checkIsAdmin(this.user);
      if (isAuthAdmin) {
        this.isAdminUser = true;
        localStorage.setItem('honesty_admin_auth', 'true');
        const modal = document.getElementById('admin-auth-modal');
        if (modal) modal.classList.remove('active');
        if (window.adminApp && typeof window.adminApp.render === 'function') {
          window.adminApp.render();
        }
        if (window.showToast) window.showToast(`Welcome back, ${this.user.fullName}!`, 'success');
        return;
      } else {
        if (errEl) {
          errEl.innerHTML = `<strong>Access Denied:</strong> Signed in as <code>${this.user.email}</code>, but this account is not registered in the <code>admin_users</code> table.`;
          errEl.style.display = 'block';
        }
        return;
      }
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.style.opacity = '0.7';
    }

    try {
      await window.supabaseClient.signInWithGoogle();
    } catch (err) {
      console.error('[AuthManager] Admin Google Sign In Failed:', err);
      if (errEl) {
        errEl.innerText = err.message || 'Google sign in failed.';
        errEl.style.display = 'block';
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
      }
    }
  }

  async logout() {
    try {
      if (window.supabaseClient) {
        await window.supabaseClient.signOut();
      }
    } catch (e) {
      console.warn('[AuthManager] Sign out exception:', e);
    }
    this.handleUserSignedOut();
    this.closeAuthModal();

    if (window.showToast) {
      window.showToast('You have been signed out.', 'info');
    }

    // Return to catalog view if in customer app
    if (window.customerApp && typeof window.customerApp.switchScreen === 'function') {
      window.customerApp.switchScreen('screen-catalog');
    }
  }

  // ============================================================
  // UI & MODAL MANAGEMENT
  // ============================================================

  openAuthModal(options = {}) {
    this.authCallback = options.onSuccess || null;
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const signinView = document.getElementById('auth-view-signin');
    const profileView = document.getElementById('auth-step-profile');
    const errLogin = document.getElementById('login-error-msg');
    if (errLogin) errLogin.style.display = 'none';

    if (this.isLoggedIn && this.user) {
      if (signinView) signinView.style.display = 'none';
      if (profileView) profileView.style.display = 'block';

      const profName = document.getElementById('profile-modal-name');
      const profEmail = document.getElementById('profile-modal-email');
      const profAvatar = document.getElementById('profile-modal-avatar');

      if (profName) profName.innerText = this.user.fullName;
      if (profEmail) profEmail.innerText = this.user.email;
      if (profAvatar && this.user.avatarUrl) profAvatar.src = this.user.avatarUrl;

      const phoneInput = document.getElementById('profile-phone-input');
      if (phoneInput) {
        phoneInput.value = this.getUserPhone();
      }
      const phoneMsg = document.getElementById('profile-phone-msg');
      if (phoneMsg) phoneMsg.style.display = 'none';
    } else {
      if (signinView) signinView.style.display = 'block';
      if (profileView) profileView.style.display = 'none';
    }

    this.updateUI();
    modal.classList.add('active');
  }

  closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
  }

  updateUI() {
    // 1. Status dot in header
    const dot = document.getElementById('auth-status-dot');
    if (dot) {
      if (this.isLoggedIn) {
        dot.style.background = '#10b981';
        dot.title = `Signed in as ${this.user?.fullName} (${this.user?.email})`;
      } else {
        dot.style.background = '#94a3b8';
        dot.title = 'Not signed in. Click to authenticate with Google.';
      }
    }

    // 2. Header Avatars
    const avatarImgs = document.querySelectorAll('.header-avatar img, .cart-avatar-wrap img');
    avatarImgs.forEach(img => {
      if (this.isLoggedIn && this.user?.avatarUrl && !this.user.avatarUrl.includes('assets/avatar.png')) {
        img.src = this.user.avatarUrl;
      }
    });

    // 3. User status badges
    const statusBadges = document.querySelectorAll('.auth-user-status');
    statusBadges.forEach(el => {
      if (this.isLoggedIn) {
        el.innerText = this.user?.fullName || this.user?.email || 'Customer';
        el.title = `Signed in as ${this.user?.email}`;
      } else {
        el.innerText = 'Sign In';
      }
    });

    // 4. Phone status badge in profile view
    const phoneBadge = document.getElementById('profile-phone-status-badge');
    if (phoneBadge) {
      const phone = this.getUserPhone();
      const isValid = Boolean(phone && /^[6-9]\d{9}$/.test(phone));
      if (isValid) {
        phoneBadge.style.background = '#dcfce7';
        phoneBadge.style.color = '#15803d';
        phoneBadge.innerText = '✓ Ready for Cashfree';
      } else {
        phoneBadge.style.background = '#fef3c7';
        phoneBadge.style.color = '#b45309';
        phoneBadge.innerText = '⚠️ Required for Payment';
      }
    }
  }

  bindDOM() {
    // Header avatar clicks
    const avatarBtns = document.querySelectorAll('.header-avatar, .cart-avatar-wrap');
    avatarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.openAuthModal();
      });
    });

    // Google Sign-In button
    const btnGoogle = document.getElementById('btn-google-signin');
    if (btnGoogle) {
      btnGoogle.addEventListener('click', () => {
        this.loginWithGoogle();
      });
    }

    // Admin Google Sign-In button
    const btnAdminGoogle = document.getElementById('btn-admin-google-signin');
    if (btnAdminGoogle) {
      btnAdminGoogle.addEventListener('click', () => {
        this.adminLoginWithGoogle();
      });
    }

    // Save phone number inside profile modal
    const btnSavePhone = document.getElementById('btn-save-profile-phone');
    const phoneInput = document.getElementById('profile-phone-input');
    const phoneMsg = document.getElementById('profile-phone-msg');

    if (btnSavePhone && phoneInput) {
      btnSavePhone.addEventListener('click', () => {
        const val = phoneInput.value.trim();
        try {
          const saved = this.setUserPhone(val);
          if (phoneMsg) {
            phoneMsg.style.color = '#16a34a';
            phoneMsg.innerText = `✓ Saved mobile number: +91 ${saved}`;
            phoneMsg.style.display = 'block';
          }
          if (window.showToast) window.showToast(`Phone number +91 ${saved} saved.`, 'success');
        } catch (err) {
          if (phoneMsg) {
            phoneMsg.style.color = '#dc2626';
            phoneMsg.innerText = err.message;
            phoneMsg.style.display = 'block';
          }
        }
      });
    }

    // Sign out button in profile view
    const btnLogout = document.getElementById('btn-auth-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        this.logout();
      });
    }

    // Toggle Admin Secret Key input
    const btnToggleKey = document.getElementById('btn-toggle-admin-key');
    const adminKeyForm = document.getElementById('admin-key-form');
    if (btnToggleKey && adminKeyForm) {
      btnToggleKey.addEventListener('click', () => {
        const isHidden = adminKeyForm.style.display === 'none';
        adminKeyForm.style.display = isHidden ? 'flex' : 'none';
      });
    }

    // Admin Secret Key Form Submit (Emergency access fallback)
    if (adminKeyForm) {
      adminKeyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = document.getElementById('admin-secret-key-input')?.value.trim();
        const errEl = document.getElementById('admin-login-error');
        // Valid if matches configured secret or default admin key
        if (key === 'admin123' || key === 'honesty-admin-secret-2026') {
          this.isAdminUser = true;
          localStorage.setItem('honesty_admin_auth', 'true');
          const modal = document.getElementById('admin-auth-modal');
          if (modal) modal.classList.remove('active');
          if (window.adminApp && typeof window.adminApp.render === 'function') {
            window.adminApp.render();
          }
          if (window.showToast) window.showToast('Admin Console unlocked via master key.', 'success');
        } else {
          if (errEl) {
            errEl.innerText = 'Invalid Admin Secret Key.';
            errEl.style.display = 'block';
          }
        }
      });
    }
  }

  // ============================================================
  // GETTERS & SETTERS
  // ============================================================

  getUserId() {
    return this.user?.id || null;
  }

  getUserEmail() {
    return this.user?.email || null;
  }

  getUserName() {
    return this.user?.fullName || 'Honesty Customer';
  }

  getUserPhone() {
    return this.user?.phone || localStorage.getItem('honesty_customer_phone') || '';
  }

  hasValidPhone() {
    const ph = this.getUserPhone();
    return Boolean(ph && /^[6-9]\d{9}$/.test(ph));
  }

  setUserPhone(phone) {
    const clean = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!clean || !/^[6-9]\d{9}$/.test(clean)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).');
    }
    if (this.user) {
      this.user.phone = clean;
      try {
        localStorage.setItem('honesty_customer_user', JSON.stringify(this.user));
      } catch (e) {}
    } else {
      this.user = { id: null, email: '', fullName: 'Honesty Customer', phone: clean };
    }
    localStorage.setItem('honesty_customer_phone', clean);

    // Sync with Supabase Auth user metadata if logged in
    if (window.supabaseClient && window.supabaseClient.client && this.isLoggedIn) {
      window.supabaseClient.client.auth.updateUser({
        data: { phone: clean }
      }).catch(err => console.warn('[AuthManager] Supabase metadata sync warning:', err));
    }

    this.updateUI();
    return clean;
  }

  getAccessToken() {
    return this.session?.access_token || null;
  }

  isAuthenticated() {
    return Boolean(this.isLoggedIn && this.user?.id);
  }

  isAdmin() {
    return Boolean(this.isAdminUser || localStorage.getItem('honesty_admin_auth') === 'true');
  }
}

window.authManager = new AuthManager();
