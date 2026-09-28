/**
 * Honesty Store - Supabase Client & Realtime Sync Layer (Production Ready)
 * Handles Google OAuth, PostgreSQL queries, Realtime subscriptions, and Atomic RPCs.
 */

class SupabaseClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.realtimeChannels = {};
    this.listeners = {
      productChange: [],
      orderChange: [],
      metricChange: []
    };
    this.init();
  }

  async init() {
    if (window.AppConfig && window.AppConfig.supabase.isConfigured()) {
      await this.loadSDK();
    }
  }

  async loadSDK() {
    if (window.supabase) {
      this.initClient();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => {
      this.initClient();
    };
    script.onerror = () => {
      console.warn('[SupabaseClient] Could not load Supabase SDK from CDN.');
    };
    document.head.appendChild(script);
  }

  initClient() {
    try {
      const { url, anonKey } = window.AppConfig.supabase;
      this.client = window.supabase.createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });
      this.isConnected = true;
      console.log('[SupabaseClient] Connected to Supabase PostgreSQL at:', url);

      this.subscribeRealtime();
    } catch (err) {
      console.warn('[SupabaseClient] Initialization warning:', err);
    }
  }

  // ============================================================
  // AUTHENTICATION: GOOGLE OAUTH & SESSION MANAGEMENT
  // ============================================================

  async signInWithGoogle(options = {}) {
    if (!this.client) {
      throw new Error('Supabase client is not initialized. Check internet connection and configuration.');
    }
    const currentOrigin = window.location.origin;
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '';
    const redirectTo = options.redirectTo || `${currentOrigin}${currentPath}/`;

    console.log('[SupabaseClient] Initiating Google OAuth with redirect to:', redirectTo);
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });

    if (error) {
      console.error('[SupabaseClient] Google OAuth Error:', error);
      throw error;
    }
    return data;
  }

  async signOut() {
    if (!this.client) return;
    try {
      await this.client.auth.signOut();
    } catch (e) {
      console.warn('[SupabaseClient] Error signing out:', e);
    }
  }

  async getSession() {
    if (!this.client) return null;
    try {
      const { data } = await this.client.auth.getSession();
      return data ? data.session : null;
    } catch (e) {
      return null;
    }
  }

  async getUser() {
    if (!this.client) return null;
    try {
      const { data } = await this.client.auth.getUser();
      return data ? data.user : null;
    } catch (e) {
      return null;
    }
  }

  onAuthStateChange(callback) {
    if (!this.client) return null;
    return this.client.auth.onAuthStateChange(callback);
  }

  /**
   * Check if a given user has Administrator privileges.
   * Authoritative check:
   * 1. Check PostgreSQL is_admin() SECURITY DEFINER function
   * 2. Query public.admin_users table
   * 3. Fallback to primary store administrator email
   */
  async checkIsAdmin(user) {
    if (!user) return false;
    const userEmail = (user.email || '').toLowerCase().trim();
    const userId = user.id;

    // Hardcoded owner fallback for safety
    if (userEmail === 'mohammedshabeeb923@gmail.com') {
      return true;
    }

    if (!this.client) return false;

    // 1. Try is_admin() RPC
    try {
      const { data, error } = await this.client.rpc('is_admin');
      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch (e) {
      // RPC may not exist if migration hasn't run yet
    }

    // 2. Query admin_users table directly
    try {
      let query = this.client.from('admin_users').select('id, email, role');
      if (userId) {
        query = query.or(`user_id.eq.${userId},email.eq.${userEmail}`);
      } else {
        query = query.eq('email', userEmail);
      }
      const { data, error } = await query.limit(1);
      if (!error && data && data.length > 0) {
        return true;
      }
    } catch (e) {
      // Table may not exist yet
    }

    return false;
  }

  // ============================================================
  // REALTIME CHANNELS
  // ============================================================

  subscribeRealtime() {
    if (!this.client) return;

    // 1. Realtime channel for products & stock changes
    this.realtimeChannels.products = this.client
      .channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('[Supabase Realtime] Product change:', payload.eventType, payload.new || payload.old);
        if (window.storeDB && typeof window.storeDB.handleRealtimeProductUpdate === 'function') {
          window.storeDB.handleRealtimeProductUpdate(payload);
        }
        this.listeners.productChange.forEach(cb => {
          try { cb(payload); } catch (e) {}
        });
      })
      .subscribe();

    // 2. Realtime channel for orders
    this.realtimeChannels.orders = this.client
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('[Supabase Realtime] Order event:', payload.eventType, payload.new || payload.old);
        if (window.storeDB && typeof window.storeDB.handleRealtimeOrderUpdate === 'function') {
          window.storeDB.handleRealtimeOrderUpdate(payload);
        }
        this.listeners.orderChange.forEach(cb => {
          try { cb(payload); } catch (e) {}
        });
      })
      .subscribe();

    // 3. Realtime channel for community metrics
    this.realtimeChannels.metrics = this.client
      .channel('public:community_metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_metrics' }, (payload) => {
        console.log('[Supabase Realtime] Community metrics updated:', payload.new);
        if (payload.new && window.storeDB) {
          window.storeDB.data.community.salesToday = Number(payload.new.sales_today) || 0;
          window.storeDB.data.community.storeVisits = Number(payload.new.store_visits) || 0;
          window.storeDB.data.community.completedPayments = Number(payload.new.completed_payments) || 0;
          window.storeDB.notify();
        }
        this.listeners.metricChange.forEach(cb => {
          try { cb(payload); } catch (e) {}
        });
      })
      .subscribe();
  }

  // ============================================================
  // DATABASE QUERIES (PRODUCTS, ORDERS, INVENTORY, METRICS)
  // ============================================================

  /**
   * Fetch active catalog products from Supabase
   */
  async fetchProducts() {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.warn('[SupabaseClient] Error fetching products:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('[SupabaseClient] fetchProducts exception:', e);
      return [];
    }
  }

  /**
   * Fetch orders strictly belonging to a specific customer (RLS enforced)
   */
  async getUserOrders(userId) {
    if (!this.client || !userId) return [];
    try {
      const { data, error } = await this.client
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SupabaseClient] Error fetching user orders:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('[SupabaseClient] getUserOrders exception:', e);
      return [];
    }
  }

  /**
   * Fetch all store orders (Admin only - RLS is_admin() enforced)
   */
  async getAllOrders() {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SupabaseClient] Error fetching admin orders:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('[SupabaseClient] getAllOrders exception:', e);
      return [];
    }
  }

  /**
   * Record a new order in Supabase
   */
  async createOrder(order) {
    if (!this.client) return null;
    try {
      const user = await this.getUser();
      const payload = {
        id: order.id,
        user_id: user ? user.id : (order.userId || null),
        customer_phone: order.customerPhone || null,
        customer_email: user ? user.email : (order.customerEmail || null),
        customer_name: user ? (user.user_metadata?.full_name || user.user_metadata?.name || user.email) : (order.customerName || null),
        amount: order.amount,
        item_count: order.itemCount || (Array.isArray(order.items) ? order.items.length : 1),
        items: order.items || [],
        status: order.status || 'PAID',
        payment_method: order.paymentMethod || 'UPI',
        payment_gateway: order.paymentGateway || 'Cashfree',
        cashfree_order_id: order.cashfreeOrderId || order.id,
        time_label: order.timeLabel || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const { data, error } = await this.client
        .from('orders')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.warn('[SupabaseClient] createOrder error:', error);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[SupabaseClient] createOrder exception:', e);
      return null;
    }
  }

  /**
   * Deduct inventory atomically using PostgreSQL RPC with row locks
   */
  async deductInventoryRPC(items) {
    if (!this.client || !items || items.length === 0) return false;
    try {
      const formattedItems = items.map(i => ({
        id: i.id,
        qty: Number(i.qty) || 1
      }));
      const { data, error } = await this.client.rpc('deduct_inventory', {
        p_items: formattedItems
      });

      if (error) {
        console.error('[SupabaseClient] deduct_inventory RPC error:', error);
        return false;
      }
      return data === true;
    } catch (e) {
      console.warn('[SupabaseClient] deductInventoryRPC exception:', e);
      return false;
    }
  }

  /**
   * Admin: Add new product to Supabase
   */
  async addProduct(product) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('products')
        .insert([{
          id: product.id,
          name: product.name,
          variant: product.variant || '',
          category: product.category || 'Chips',
          price: Number(product.price) || 0,
          stock: Number(product.stock) || 0,
          expected_stock: Number(product.stock) || 0,
          physical_stock: Number(product.stock) || 0,
          image_url: product.image || product.image_url || 'assets/lays.png',
          low_stock_threshold: product.lowStockThreshold || 5,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[SupabaseClient] addProduct error:', e);
      throw e;
    }
  }

  /**
   * Admin: Update product details / stock in Supabase
   */
  async updateProduct(id, updates) {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[SupabaseClient] updateProduct error:', e);
      throw e;
    }
  }

  /**
   * Admin: Perform physical stock reconciliation audit
   */
  async recordStockAudit(audit) {
    if (!this.client) return null;
    try {
      const user = await this.getUser();
      const { data, error } = await this.client
        .from('stock_audits')
        .insert([{
          product_id: audit.productId,
          expected_stock: audit.expectedStock,
          physical_stock: audit.physicalStock,
          discrepancy: audit.discrepancy,
          discrepancy_value: audit.discrepancyValue,
          status: audit.status || (audit.discrepancy < 0 ? 'SHRINKAGE' : (audit.discrepancy > 0 ? 'EXCESS' : 'BALANCED')),
          notes: audit.notes || '',
          audited_by: user ? user.email : 'admin'
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[SupabaseClient] recordStockAudit error:', e);
      throw e;
    }
  }
}

window.supabaseClient = new SupabaseClient();
