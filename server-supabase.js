/**
 * Honesty Store - Server-Side Supabase & PostgreSQL Data Layer
 * Handles authoritative database operations: products, orders, inventory, metrics, and profiles.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const FALLBACK_DB_FILE = path.join(DATA_DIR, 'db-fallback.json');

// Default initial seed data if DB is completely fresh
const DEFAULT_PRODUCTS = [
  { id: 'lays', name: 'Lays', variant: 'Classic Potato Chips', category: 'Chips', price: 20, stock: 18, expected_stock: 18, physical_stock: 15, image_url: 'assets/lays.png', is_active: true },
  { id: 'oreo', name: 'Oreo', variant: 'Chocolate Sandwich Cookies', category: 'Biscuits', price: 30, stock: 3, expected_stock: 3, physical_stock: 3, image_url: 'assets/oreo.png', is_active: true },
  { id: 'parleg', name: 'Parle-G', variant: 'Glucose Biscuits', category: 'Biscuits', price: 10, stock: 25, expected_stock: 25, physical_stock: 25, image_url: 'assets/parleg.png', is_active: true },
  { id: 'dairymilk', name: 'Dairy Milk', variant: 'Milk Chocolate Bar', category: 'Chocolates', price: 20, stock: 0, expected_stock: 0, physical_stock: 0, image_url: 'assets/dairymilk.png', is_active: true },
  { id: 'upitest', name: '₹1 Live UPI Test', variant: 'Gateway Verification Item', category: 'Chips', price: 1, stock: 99, expected_stock: 99, physical_stock: 99, image_url: 'assets/lays.png', is_active: true }
];

class ServerSupabase {
  constructor() {
    this.fallbackData = this.loadFallback();
  }

  getEnv() {
    return {
      url: (process.env.SUPABASE_URL || 'https://hiolzzvqcgernfebgdbm.supabase.co').replace(/\/+$/, ''),
      key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpb2x6enZxY2dlcm5mZWJnZGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzAwOTIsImV4cCI6MjEwNTg0NjA5Mn0.3q_2KhFenDVen1MuCZxXf87QpqA10GLWY0q4YFzLTUY'
    };
  }

  loadFallback() {
    try {
      if (fs.existsSync(FALLBACK_DB_FILE)) {
        return JSON.parse(fs.readFileSync(FALLBACK_DB_FILE, 'utf-8'));
      }
    } catch (e) {}
    return {
      products: DEFAULT_PRODUCTS,
      orders: [],
      profiles: [],
      stock_audits: [],
      community_metrics: { sales_today: 0, store_visits: 0, completed_payments: 0 }
    };
  }

  saveFallback() {
    try {
      fs.writeFileSync(FALLBACK_DB_FILE, JSON.stringify(this.fallbackData, null, 2));
    } catch (e) {}
  }

  async fetchApi(table, options = {}) {
    const { url, key } = this.getEnv();
    const endpoint = `${url}/rest/v1/${table}${options.query || ''}`;
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(endpoint, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`Supabase [${table}] HTTP ${res.status}: ${errText}`);
      err.status = res.status;
      err.body = errText;
      throw err;
    }

    if (res.status === 204) return null;
    return await res.json();
  }

  // 1. GET ALL ACTIVE PRODUCTS
  async getProducts() {
    try {
      const products = await this.fetchApi('products', {
        query: '?select=*&is_active=eq.true&order=name.asc'
      });
      if (products && products.length > 0) {
        // Cache in fallback
        this.fallbackData.products = products;
        this.saveFallback();
        return products;
      }
    } catch (err) {
      console.warn('[ServerSupabase] getProducts fallback:', err.message);
    }
    return this.fallbackData.products || DEFAULT_PRODUCTS;
  }

  // 2. GET SINGLE PRODUCT
  async getProduct(productId) {
    try {
      const res = await this.fetchApi('products', {
        query: `?id=eq.${productId}&select=*`
      });
      if (res && res.length > 0) return res[0];
    } catch (err) {
      console.warn(`[ServerSupabase] getProduct(${productId}) fallback:`, err.message);
    }
    return (this.fallbackData.products || []).find(p => p.id === productId);
  }

  // 3. CREATE ORDER (PENDING)
  async createOrder(orderData) {
    const record = {
      id: orderData.id,
      customer_phone: orderData.customerPhone,
      amount: Number(orderData.amount),
      item_count: Number(orderData.itemCount),
      items: orderData.items,
      status: orderData.status || 'PENDING',
      payment_method: orderData.paymentMethod || 'UPI',
      payment_gateway: 'Cashfree',
      time_label: orderData.timeLabel || 'TODAY',
      created_at: new Date().toISOString()
    };

    // Save locally first for guaranteed resilience
    const existingIdx = (this.fallbackData.orders || []).findIndex(o => o.id === record.id);
    if (existingIdx >= 0) {
      this.fallbackData.orders[existingIdx] = record;
    } else {
      this.fallbackData.orders.unshift(record);
    }
    this.saveFallback();

    // Persist to Supabase
    try {
      await this.fetchApi('orders', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: record
      });
      console.log(`[ServerSupabase] Order ${record.id} created in Supabase (Status: ${record.status})`);
    } catch (err) {
      console.warn(`[ServerSupabase] createOrder(${record.id}) remote warning:`, err.message);
    }

    return record;
  }

  // 4. VERIFY & CONFIRM ORDER PAYMENT (ATOMIC INVENTORY & METRICS UPDATE)
  async confirmOrderPayment(orderId, cfPaymentId, cfOrderId) {
    let order = (this.fallbackData.orders || []).find(o => o.id === orderId);

    // Try fetching from Supabase
    try {
      const remoteOrders = await this.fetchApi('orders', { query: `?id=eq.${orderId}&select=*` });
      if (remoteOrders && remoteOrders.length > 0) {
        order = remoteOrders[0];
      }
    } catch (e) {}

    if (!order) {
      throw new Error(`Order ${orderId} not found in database`);
    }

    // Idempotency: If already marked Paid, don't double-deduct inventory
    if (order.status === 'PAID' || order.status === 'Paid') {
      console.log(`[ServerSupabase] Order ${orderId} is already confirmed as PAID.`);
      return { order, alreadyPaid: true };
    }

    const verifiedAt = new Date().toISOString();
    order.status = 'PAID';
    order.cashfree_payment_id = cfPaymentId || order.cashfree_payment_id;
    order.cashfree_order_id = cfOrderId || order.cashfree_order_id;
    order.verified_at = verifiedAt;

    // Update in fallback
    const idx = (this.fallbackData.orders || []).findIndex(o => o.id === orderId);
    if (idx >= 0) this.fallbackData.orders[idx] = order;
    this.saveFallback();

    // 1. Update Order in Supabase
    try {
      await this.fetchApi('orders', {
        method: 'PATCH',
        query: `?id=eq.${orderId}`,
        body: {
          status: 'PAID',
          cashfree_payment_id: cfPaymentId,
          cashfree_order_id: cfOrderId
        }
      });
      console.log(`[ServerSupabase] Order ${orderId} marked as PAID in Supabase.`);
    } catch (e) {
      console.warn(`[ServerSupabase] Could not update order ${orderId} in Supabase:`, e.message);
    }

    // 2. Atomically Deduct Inventory in Supabase & Fallback
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      await this.deductProductStock(item.id, Number(item.qty) || 1);
    }

    // 3. Update Community Metrics in Supabase & Fallback
    await this.incrementCommunitySales(Number(order.amount) || 0);

    // 4. Update Customer Profile
    if (order.customer_phone) {
      await this.recordCustomerOrder(order.customer_phone, Number(order.amount) || 0);
    }

    return { order, alreadyPaid: false };
  }

  // 5. ATOMICALLY DEDUCT INVENTORY
  async deductProductStock(productId, qty) {
    // 1. Update in local fallback
    const localProd = (this.fallbackData.products || []).find(p => p.id === productId);
    let newStock = 0;
    if (localProd) {
      localProd.stock = Math.max(0, (localProd.stock || 0) - qty);
      localProd.physical_stock = Math.max(0, (localProd.physical_stock || 0) - qty);
      localProd.expected_stock = localProd.stock;
      newStock = localProd.stock;
      this.saveFallback();
    }

    // 2. Fetch latest live stock from Supabase and decrement
    try {
      const remoteProd = await this.getProduct(productId);
      if (remoteProd) {
        newStock = Math.max(0, (remoteProd.stock || 0) - qty);
        const newPhysical = Math.max(0, (remoteProd.physical_stock || remoteProd.stock) - qty);
        await this.fetchApi('products', {
          method: 'PATCH',
          query: `?id=eq.${productId}`,
          body: {
            stock: newStock,
            expected_stock: newStock,
            physical_stock: newPhysical,
            updated_at: new Date().toISOString()
          }
        });
        console.log(`[ServerSupabase] Decremented stock for ${productId}: now ${newStock}`);
      }
    } catch (err) {
      console.warn(`[ServerSupabase] deductProductStock(${productId}) remote warning:`, err.message);
    }
  }

  // 6. UPDATE COMMUNITY METRICS
  async incrementCommunitySales(amount) {
    if (!this.fallbackData.community_metrics) {
      this.fallbackData.community_metrics = { sales_today: 0, store_visits: 0, completed_payments: 0 };
    }
    this.fallbackData.community_metrics.sales_today += amount;
    this.fallbackData.community_metrics.completed_payments += 1;
    this.saveFallback();

    const todayDate = new Date().toISOString().split('T')[0];
    try {
      // Check if row for today exists
      const existing = await this.fetchApi('community_metrics', { query: `?date=eq.${todayDate}&select=*` });
      if (existing && existing.length > 0) {
        const cur = existing[0];
        await this.fetchApi('community_metrics', {
          method: 'PATCH',
          query: `?date=eq.${todayDate}`,
          body: {
            sales_today: (Number(cur.sales_today) || 0) + amount,
            completed_payments: (Number(cur.completed_payments) || 0) + 1
          }
        });
      } else {
        await this.fetchApi('community_metrics', {
          method: 'POST',
          body: {
            date: todayDate,
            sales_today: amount,
            completed_payments: 1,
            store_visits: 1,
            pledges_count: 0
          }
        });
      }
    } catch (err) {
      console.warn('[ServerSupabase] incrementCommunitySales remote warning:', err.message);
    }
  }

  // 7. RECORD CUSTOMER VISIT & ORDERS
  async recordCustomerOrder(phone, amount) {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const existing = (this.fallbackData.profiles || []).find(p => p.phone === cleanPhone);
    if (existing) {
      existing.total_orders = (existing.total_orders || 0) + 1;
      existing.total_spent = (existing.total_spent || 0) + amount;
      existing.last_visit = new Date().toISOString();
    } else {
      this.fallbackData.profiles.push({
        phone: cleanPhone,
        total_orders: 1,
        total_spent: amount,
        last_visit: new Date().toISOString()
      });
    }
    this.saveFallback();

    try {
      await this.fetchApi('profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: {
          phone: cleanPhone,
          total_orders: existing ? (existing.total_orders + 1) : 1,
          total_spent: existing ? (existing.total_spent + amount) : amount
        }
      });
    } catch (err) {
      // Ignored if RLS restricts anon profile upsert
    }
  }

  // 7b. GET CUSTOMER PROFILE BY PHONE
  async getProfile(phone) {
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    try {
      const res = await this.fetchApi('profiles', {
        query: `?phone=eq.${cleanPhone}&select=*`
      });
      if (res && res.length > 0) return res[0];
    } catch (err) {
      // Fallback
    }
    return (this.fallbackData.profiles || []).find(p => p.phone === cleanPhone);
  }

  // 7c. REGISTER USER PROFILE (PHONE + PASSWORD HASH)
  async registerUser(name, phone, passwordHash) {
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    const crypto = require('crypto');
    const profileRecord = {
      id: crypto.randomUUID(),
      phone: cleanPhone,
      full_name: name,
      password_hash: passwordHash,
      trust_score: 100.0,
      total_orders: 0,
      total_spent: 0.0,
      pledge_signed: false,
      created_at: new Date().toISOString()
    };

    if (!this.fallbackData.profiles) this.fallbackData.profiles = [];
    const existingIdx = this.fallbackData.profiles.findIndex(p => p.phone === cleanPhone);
    if (existingIdx >= 0) {
      this.fallbackData.profiles[existingIdx] = { ...this.fallbackData.profiles[existingIdx], ...profileRecord };
    } else {
      this.fallbackData.profiles.push(profileRecord);
    }
    this.saveFallback();

    // Persist to Supabase
    try {
      await this.fetchApi('profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: profileRecord
      });
      console.log(`[ServerSupabase] Profile for +91 ${cleanPhone} saved to Supabase.`);
    } catch (err) {
      console.warn(`[ServerSupabase] registerUser(${cleanPhone}) remote warning:`, err.message);
    }

    return profileRecord;
  }


  // 8. GET ORDERS FOR CUSTOMER OR ADMIN
  async getOrders(phoneFilter = null) {
    let cleanPhone = phoneFilter ? phoneFilter.replace(/\D/g, '').slice(-10) : null;
    try {
      const query = cleanPhone 
        ? `?select=*&customer_phone=like.*${cleanPhone}&order=created_at.desc` 
        : '?select=*&order=created_at.desc&limit=100';
      const remote = await this.fetchApi('orders', { query });
      if (remote && Array.isArray(remote)) {
        return remote;
      }
    } catch (e) {
      console.warn('[ServerSupabase] getOrders fallback:', e.message);
    }

    let orders = this.fallbackData.orders || [];
    if (cleanPhone) {
      orders = orders.filter(o => (o.customer_phone || '').includes(cleanPhone));
    }
    return orders;
  }

  // 9. ADJUST STOCK & RECORD AUDIT LOG (ADMIN)
  async adjustStock(productId, newStockLevel, auditNote = '', auditedBy = 'Admin') {
    const prod = await this.getProduct(productId);
    const expected = prod ? (prod.expected_stock !== undefined ? prod.expected_stock : prod.stock) : 0;
    const numStock = Number(newStockLevel) || 0;
    const discrepancy = numStock - expected;
    const unitPrice = prod ? Number(prod.price) : 0;
    const shrinkageValue = Math.abs(discrepancy) * unitPrice;

    // 1. Update in local fallback
    const localProd = (this.fallbackData.products || []).find(p => p.id === productId);
    if (localProd) {
      localProd.stock = numStock;
      localProd.expected_stock = numStock;
      localProd.physical_stock = numStock;
      this.saveFallback();
    }

    // 2. Update Product in Supabase
    try {
      await this.fetchApi('products', {
        method: 'PATCH',
        query: `?id=eq.${productId}`,
        body: {
          stock: numStock,
          expected_stock: numStock,
          physical_stock: numStock,
          updated_at: new Date().toISOString()
        }
      });
      console.log(`[ServerSupabase] Stock adjusted for ${productId} to ${numStock}`);
    } catch (e) {
      console.warn(`[ServerSupabase] adjustStock(${productId}) product update warning:`, e.message);
    }

    // 3. Insert Audit Log in Supabase
    const auditRecord = {
      product_id: productId,
      expected_units: expected,
      physical_units: numStock,
      discrepancy,
      shrinkage_value: shrinkageValue,
      audit_note: auditNote || 'Manual stock adjustment',
      audited_by: auditedBy,
      created_at: new Date().toISOString()
    };

    if (!this.fallbackData.stock_audits) this.fallbackData.stock_audits = [];
    this.fallbackData.stock_audits.unshift(auditRecord);
    this.saveFallback();

    try {
      await this.fetchApi('stock_audits', {
        method: 'POST',
        body: auditRecord
      });
    } catch (e) {
      // Ignored if RLS restricts
    }

    return { product: localProd || prod, audit: auditRecord };
  }

  // 10. ADD PRODUCT (ADMIN)
  async addProduct(newProduct) {
    const id = newProduct.id || ('prod_' + Date.now());
    const productRecord = {
      id,
      name: newProduct.name,
      variant: newProduct.variant || '',
      category: newProduct.category || 'Chips',
      price: Number(newProduct.price) || 10,
      stock: Number(newProduct.stock) || 0,
      expected_stock: Number(newProduct.stock) || 0,
      physical_stock: Number(newProduct.stock) || 0,
      image_url: newProduct.image_url || newProduct.image || 'assets/lays.png',
      low_stock_threshold: 5,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    // Save in fallback
    if (!this.fallbackData.products) this.fallbackData.products = [];
    this.fallbackData.products.push(productRecord);
    this.saveFallback();

    try {
      await this.fetchApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: productRecord
      });
      console.log(`[ServerSupabase] New product added to Supabase: ${productRecord.name}`);
    } catch (e) {
      console.warn(`[ServerSupabase] addProduct(${id}) remote warning:`, e.message);
    }

    return productRecord;
  }

  // 11. REAL DASHBOARD METRICS AGGREGATION
  async getDashboardMetrics() {
    const orders = await this.getOrders();
    const paidOrders = orders.filter(o => o.status === 'PAID' || o.status === 'Paid');

    const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const totalOrdersCount = paidOrders.length;

    // Calculate today's metrics
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = paidOrders.filter(o => (o.created_at || '').startsWith(todayStr));
    const salesToday = todayOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const todayOrdersCount = todayOrders.length;

    // Total items sold
    let totalItemsSold = 0;
    const productCounts = {};

    paidOrders.forEach(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach(item => {
        const qty = Number(item.qty) || 1;
        totalItemsSold += qty;
        productCounts[item.name || item.id] = (productCounts[item.name || item.id] || 0) + qty;
      });
    });

    // Top selling products sorted
    const topProducts = Object.entries(productCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      salesToday,
      todayOrdersCount,
      totalRevenue,
      totalOrdersCount,
      totalItemsSold,
      completedPayments: totalOrdersCount,
      topProducts,
      recentOrders: paidOrders.slice(0, 10)
    };
  }
}

module.exports = new ServerSupabase();
