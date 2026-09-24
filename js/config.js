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
    anonKey: localStorage.getItem('HONESTY_SUPABASE_ANON_KEY') || '',
    // When false or unconfigured, gracefully falls back to local reactive storage
    isConfigured: function() {
      return this.url && this.url.includes('supabase.co') && this.anonKey && this.anonKey.length > 20;
    }
  },

  // 2. CASHFREE PAYMENT GATEWAY CONFIGURATION
  cashfree: {
    // Cashfree Environment: 'SANDBOX' or 'PRODUCTION'
    environment: localStorage.getItem('HONESTY_CASHFREE_ENV') || 'SANDBOX',
    // Cashfree App ID from Cashfree Merchant Dashboard
    appId: localStorage.getItem('HONESTY_CASHFREE_APP_ID') || 'TEST_APP_ID',
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
  saveLiveCredentials: function({ supabaseUrl, supabaseAnonKey, cashfreeAppId, cashfreeEnv }) {
    if (supabaseUrl) localStorage.setItem('HONESTY_SUPABASE_URL', supabaseUrl);
    if (supabaseAnonKey) localStorage.setItem('HONESTY_SUPABASE_ANON_KEY', supabaseAnonKey);
    if (cashfreeAppId) localStorage.setItem('HONESTY_CASHFREE_APP_ID', cashfreeAppId);
    if (cashfreeEnv) localStorage.setItem('HONESTY_CASHFREE_ENV', cashfreeEnv);
    window.location.reload();
  }
};

window.AppConfig = AppConfig;
