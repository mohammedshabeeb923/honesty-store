/**
 * Honesty Store - Supabase Client & Realtime Sync Layer
 * Manages PostgreSQL queries, Realtime subscriptions, and remote sync
 */

class SupabaseClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
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
    document.head.appendChild(script);
  }

  initClient() {
    try {
      const { url, anonKey } = window.AppConfig.supabase;
      this.client = window.supabase.createClient(url, anonKey);
      this.isConnected = true;
      console.log('Connected to Supabase PostgreSQL at:', url);

      this.subscribeRealtime();
      this.fetchRemoteProducts();
    } catch (err) {
      console.warn('Supabase initialization failed:', err);
    }
  }

  subscribeRealtime() {
    if (!this.client) return;

    // Realtime channel for products & stock
    this.client
      .channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('Realtime product change from Supabase:', payload);
        if (payload.new) {
          const localProd = window.storeDB.getProduct(payload.new.id);
          if (localProd) {
            localProd.stock = payload.new.stock;
            localProd.expectedStock = payload.new.expected_stock;
            localProd.physicalStock = payload.new.physical_stock;
            window.storeDB.save();
          }
        }
      })
      .subscribe();

    // Realtime channel for orders
    this.client
      .channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        console.log('Realtime order created on Supabase:', payload);
        if (payload.new && !window.storeDB.data.orders.some(o => o.id === payload.new.id)) {
          window.storeDB.data.orders.unshift(payload.new);
          window.storeDB.save();
        }
      })
      .subscribe();
  }

  async fetchRemoteProducts() {
    if (!this.client) return;
    try {
      const { data, error } = await this.client.from('products').select('*');
      if (data && data.length > 0) {
        console.log('Synced products from Supabase:', data.length);
      }
    } catch (e) {
      console.warn('Could not query Supabase products:', e);
    }
  }

  async recordOrder(order) {
    if (!this.client) return;
    try {
      await this.client.from('orders').insert([{
        id: order.id,
        customer_phone: window.authManager.getUserPhone(),
        amount: order.amount,
        item_count: order.itemCount,
        items: order.items,
        status: order.status,
        payment_method: order.paymentMethod || 'Cashfree UPI',
        time_label: order.timeLabel
      }]);
    } catch (e) {
      console.warn('Could not save order to Supabase:', e);
    }
  }

  async updateProductStock(productId, stock, physicalStock) {
    if (!this.client) return;
    try {
      await this.client
        .from('products')
        .update({ stock, expected_stock: stock, physical_stock: physicalStock })
        .eq('id', productId);
    } catch (e) {
      console.warn('Could not update product stock in Supabase:', e);
    }
  }
}

window.supabaseClient = new SupabaseClient();
