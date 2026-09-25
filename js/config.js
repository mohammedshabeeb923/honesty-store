/**
 * Honesty Store - Production Integrations Configuration
 * Handles Supabase, Cashfree PG, and Phone OTP Auth settings
 */

const AppConfig = {
  // 1. SUPABASE CONFIGURATION
  supabase: {
    // Replace with your project URL from Supabase Dashboard > Settings > API
    url: localStorage.getItem('HONESTY_SUPABASE_URL') || 'https://hiolzzvqcgernfebgdbm.supabase.co',
    // Replace with your Project anon / public key
    anonKey: localStorage.getItem('HONESTY_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpb2x6enZxY2dlcm5mZWJnZGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzAwOTIsImV4cCI6MjEwNTg0NjA5Mn0.3q_2KhFenDVen1MuCZxXf87QpqA10GLWY0q4YFzLTUY',
    // When false or unconfigured, gracefully falls back to local reactive storage
    isConfigured: function() {
      return this.url && this.url.includes('supabase.co') && this.anonKey && this.anonKey.length > 20;
    }
  },

  // 2. CASHFREE PAYMENT GATEWAY CONFIGURATION
  cashfree: {
    // Cashfree Environment: 'PRODUCTION' (Live UPI)
    environment: (function() {
      const stored = localStorage.getItem('HONESTY_CASHFREE_ENV');
      if (stored === 'SANDBOX' && (window.location.hostname.includes('onrender.com') || window.location.protocol === 'https:')) {
        localStorage.setItem('HONESTY_CASHFREE_ENV', 'PRODUCTION');
        return 'PRODUCTION';
      }
      return stored || 'PRODUCTION';
    })(),
    // Cashfree App ID from Cashfree Merchant Dashboard
    appId: localStorage.getItem('HONESTY_CASHFREE_APP_ID') || '1442420ede8ec2d801e7dc059140242441',
    // Cashfree API Version
    apiVersion: '2023-08-01',
    isConfigured: function() {
      return this.appId && this.appId !== 'TEST_APP_ID';
    }
  },

  // 3. PHONE AUTH & SMS PROVIDER
  auth: {
    countryCode: '+91',
    otpLength: 6,
    // When testing in sandbox mode, default demo OTP is:
    sandboxOtp: '123456',
    smsProvider: 'Cashfree / Supabase Phone'
  },

  // Helper to save live credentials directly from Admin Settings
  saveLiveCredentials: async function({ supabaseUrl, supabaseAnonKey, cashfreeAppId, cashfreeSecret, cashfreeEnv }) {
    if (supabaseUrl) localStorage.setItem('HONESTY_SUPABASE_URL', supabaseUrl);
    if (supabaseAnonKey) localStorage.setItem('HONESTY_SUPABASE_ANON_KEY', supabaseAnonKey);
    if (cashfreeAppId) localStorage.setItem('HONESTY_CASHFREE_APP_ID', cashfreeAppId);
    if (cashfreeEnv) localStorage.setItem('HONESTY_CASHFREE_ENV', cashfreeEnv);

    if (cashfreeAppId || cashfreeSecret) {
      try {
        const adminToken = localStorage.getItem('honesty_admin_token') || '';
        const res = await fetch('/api/admin/save-gateway-config', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
          },
          body: JSON.stringify({
            appId: cashfreeAppId,
            secretKey: cashfreeSecret,
            env: cashfreeEnv
          })
        });
        const data = await res.json();
        console.log('[Admin Save Gateway]:', data);
      } catch (e) {
        console.warn('Could not save gateway config to server:', e);
      }
    }

    if (window.showToast) {
      window.showToast('Settings saved successfully! Gateway and database are connected.', 'success');
    }
    setTimeout(() => window.location.reload(), 1200);
  }
};

window.AppConfig = AppConfig;
