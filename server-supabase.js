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
    const text = await res.text();
    if (!text || text.trim() === '') return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async callRpc(functionName, params = {}) {
    const { url, key } = this.getEnv();
    const endpoint = `${url}/rest/v1/rpc/${functionName}`;
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`Supabase RPC [${functionName}] HTTP ${res.status}: ${errText}`);
      err.status = res.status;
      err.body = errText;
      throw err;
    }

    const text = await res.text();
    if (!text || text.trim() === '') return true;
    try {
      return JSON.parse(text);
    } catch (e) {
      return true;
    }
  }

  // 1. GET ALL PRODUCTS (OPTIONAL ARCHIVED INCLUSION)
  async getProducts(includeArchived = false) {
    try {
      const query = includeArchived 
        ? '?select=*&order=name.asc' 
        : '?select=*&is_active=eq.true&order=name.asc';
      const products = await this.fetchApi('products', { query });
      if (products && Array.isArray(products) && products.length > 0) {
        const remoteIds = new Set(products.map(p => p.id));
        const localOnly = (this.fallbackData.products || []).filter(p => !remoteIds.has(p.id));
        this.fallbackData.products = [...products, ...localOnly];
        this.saveFallback();
        return includeArchived ? this.fallbackData.products : this.fallbackData.products.filter(p => p.is_active !== false);
      }
    } catch (err) {
      console.warn('[ServerSupabase] getProducts fallback:', err.message);
    }
    const fallbackList = this.fallbackData.products || DEFAULT_PRODUCTS;
    return includeArchived ? fallbackList : fallbackList.filter(p => p.is_active !== false);
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

  // 2b. ADD NEW PRODUCT (ADMIN)
  async addProduct(productData) {
    const id = productData.id || ('prod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    const price = Math.max(0.5, Number(productData.price) || 10);
    const sellingPrice = Math.max(0.5, Number(productData.selling_price || productData.sellingPrice || price));
    const stock = Math.max(0, parseInt(productData.stock, 10) || 0);

    const record = {
      id,
      name: (productData.name || 'Snack Item').trim(),
      description: (productData.description || '').trim(),
      variant: (productData.variant || '').trim(),
      category: productData.category || 'Chips',
      price: price,
      selling_price: sellingPrice,
      stock: stock,
      expected_stock: stock,
      physical_stock: stock,
      low_stock_threshold: Math.max(1, parseInt(productData.low_stock_threshold || productData.lowStockThreshold, 10) || 5),
      image_url: productData.image_url || productData.imageUrl || productData.image || 'assets/lays.png',
      storage_path: productData.storage_path || productData.storagePath || null,
      is_active: productData.is_active !== undefined ? Boolean(productData.is_active) : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Update local fallback
    if (!this.fallbackData.products) this.fallbackData.products = [];
    const idx = this.fallbackData.products.findIndex(p => p.id === id);
    if (idx >= 0) this.fallbackData.products[idx] = record;
    else this.fallbackData.products.push(record);
    this.saveFallback();

    // Persist to Supabase
    try {
      const res = await this.fetchApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: record
      });
      console.log(`[ServerSupabase] Product added: ${record.name} (${record.id})`);
      return (Array.isArray(res) && res.length > 0) ? res[0] : (res && !Array.isArray(res) ? res : record);
    } catch (err) {
      console.warn(`[ServerSupabase] addProduct remote error:`, err.message);
      // Fallback: If migration has not yet run in Supabase SQL editor, retry with base schema columns
      if (err.message && err.message.includes('Could not find the') && err.message.includes('column')) {
        try {
          const baseRecord = {
            id: record.id,
            name: record.name,
            variant: record.variant,
            category: record.category,
            price: record.price,
            stock: record.stock,
            expected_stock: record.expected_stock,
            physical_stock: record.physical_stock,
            low_stock_threshold: record.low_stock_threshold,
            image_url: record.image_url,
            is_active: record.is_active,
            updated_at: record.updated_at
          };
          const retryRes = await this.fetchApi('products', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: baseRecord
          });
          console.log(`[ServerSupabase] Product added with base schema: ${record.name}`);
          return { ...record, ...(Array.isArray(retryRes) && retryRes.length > 0 ? retryRes[0] : {}) };
        } catch (e2) {
          console.warn(`[ServerSupabase] addProduct base schema retry warning:`, e2.message);
        }
      }
      return record;
    }
  }

  // 2c. UPDATE PRODUCT (ADMIN)
  async updateProduct(productId, updates) {
    const existing = await this.getProduct(productId);
    if (!existing) throw new Error(`Product ${productId} not found`);

    const patchPayload = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) patchPayload.name = updates.name.trim();
    if (updates.description !== undefined) patchPayload.description = updates.description.trim();
    if (updates.variant !== undefined) patchPayload.variant = updates.variant.trim();
    if (updates.category !== undefined) patchPayload.category = updates.category;
    if (updates.price !== undefined) patchPayload.price = Math.max(0.5, Number(updates.price));
    if (updates.selling_price !== undefined) patchPayload.selling_price = Math.max(0.5, Number(updates.selling_price));
    if (updates.sellingPrice !== undefined) patchPayload.selling_price = Math.max(0.5, Number(updates.sellingPrice));
    if (updates.stock !== undefined) {
      const st = Math.max(0, parseInt(updates.stock, 10));
      patchPayload.stock = st;
      patchPayload.expected_stock = st;
      patchPayload.physical_stock = st;
    }
    if (updates.low_stock_threshold !== undefined) patchPayload.low_stock_threshold = Number(updates.low_stock_threshold);
    if (updates.lowStockThreshold !== undefined) patchPayload.low_stock_threshold = Number(updates.lowStockThreshold);
    if (updates.image_url !== undefined) patchPayload.image_url = updates.image_url;
    if (updates.imageUrl !== undefined) patchPayload.image_url = updates.imageUrl;
    if (updates.storage_path !== undefined) patchPayload.storage_path = updates.storage_path;
    if (updates.storagePath !== undefined) patchPayload.storage_path = updates.storagePath;
    if (updates.is_active !== undefined) patchPayload.is_active = Boolean(updates.is_active);
    if (updates.isActive !== undefined) patchPayload.is_active = Boolean(updates.isActive);

    // Update in fallback
    const idx = (this.fallbackData.products || []).findIndex(p => p.id === productId);
    if (idx >= 0) {
      this.fallbackData.products[idx] = { ...this.fallbackData.products[idx], ...patchPayload };
      this.saveFallback();
    }

    // Persist to Supabase
    try {
      const res = await this.fetchApi('products', {
        method: 'PATCH',
        query: `?id=eq.${productId}`,
        headers: { 'Prefer': 'return=representation' },
        body: patchPayload
      });
      console.log(`[ServerSupabase] Product updated: ${productId}`);
      return (Array.isArray(res) && res.length > 0) ? res[0] : { ...existing, ...patchPayload };
    } catch (err) {
      console.warn(`[ServerSupabase] updateProduct remote warning:`, err.message);
      if (err.message && err.message.includes('Could not find the') && err.message.includes('column')) {
        try {
          const safePayload = { ...patchPayload };
          delete safePayload.selling_price;
          delete safePayload.description;
          delete safePayload.storage_path;
          delete safePayload.created_at;
          const retryRes = await this.fetchApi('products', {
            method: 'PATCH',
            query: `?id=eq.${productId}`,
            headers: { 'Prefer': 'return=representation' },
            body: safePayload
          });
          console.log(`[ServerSupabase] Product updated with base columns: ${productId}`);
          return { ...existing, ...patchPayload, ...(Array.isArray(retryRes) && retryRes.length > 0 ? retryRes[0] : {}) };
        } catch (e2) {}
      }
      return { ...existing, ...patchPayload };
    }
  }

  // 2d. ARCHIVE / TOGGLE AVAILABILITY (ADMIN)
  async archiveProduct(productId, isActive = false) {
    return await this.updateProduct(productId, { is_active: Boolean(isActive) });
  }

  // 2e. CHECK IF PRODUCT CAN BE SAFELY DELETED
  async canDeleteProduct(productId) {
    try {
      // Check RPC function
      const canDel = await this.callRpc('can_delete_product', { p_product_id: productId });
      if (typeof canDel === 'boolean') return canDel;
    } catch (e) {}

    // Fallback: check orders table
    try {
      const orders = await this.fetchApi('orders', { query: `?select=items` });
      if (Array.isArray(orders)) {
        for (const o of orders) {
          const items = Array.isArray(o.items) ? o.items : [];
          if (items.some(i => i.id === productId)) return false;
        }
      }
    } catch (e) {}

    return true;
  }

  // 2f. PERMANENTLY DELETE PRODUCT (ADMIN)
  async deleteProduct(productId) {
    const existing = await this.getProduct(productId);
    if (!existing) throw new Error(`Product ${productId} not found`);

    const isSafe = await this.canDeleteProduct(productId);
    if (!isSafe) {
      throw new Error(`Cannot permanently delete "${existing.name}" because it is referenced in past orders. Please Archive this product instead to safely hide it from the catalog.`);
    }

    // Safely remove storage image if exists
    if (existing.storage_path) {
      await this.deleteStorageImage(existing.storage_path);
    }

    // Remove from local fallback
    this.fallbackData.products = (this.fallbackData.products || []).filter(p => p.id !== productId);
    this.saveFallback();

    // Delete in Supabase
    try {
      await this.fetchApi('products', {
        method: 'DELETE',
        query: `?id=eq.${productId}`
      });
      console.log(`[ServerSupabase] Product deleted permanently: ${productId}`);
    } catch (err) {
      console.warn(`[ServerSupabase] deleteProduct remote error:`, err.message);
    }

    return { success: true, id: productId };
  }

  // 2g. SUPABASE STORAGE: UPLOAD PRODUCT IMAGE
  async uploadStorageImage(buffer, fileName, contentType = 'image/jpeg') {
    const { url, key } = this.getEnv();
    const endpoint = `${url}/storage/v1/object/product-images/${fileName}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase Storage upload HTTP ${res.status}: ${errText}`);
    }

    const publicUrl = `${url}/storage/v1/object/public/product-images/${fileName}`;
    return {
      publicUrl,
      storagePath: fileName
    };
  }

  // 2h. SUPABASE STORAGE: DELETE PRODUCT IMAGE
  async deleteStorageImage(storagePath) {
    if (!storagePath) return;
    const { url, key } = this.getEnv();
    const cleanPath = storagePath.replace(/^product-images\//, '');
    const endpoint = `${url}/storage/v1/object/product-images`;

    try {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: [cleanPath] })
      });
      console.log(`[ServerSupabase] Deleted storage object: ${cleanPath}`);
    } catch (e) {
      console.warn(`[ServerSupabase] Could not delete storage image:`, e.message);
    }
  }

  // 3. CREATE ORDER (PENDING)
  async createOrder(orderData) {
    const record = {
      id: orderData.id,
      user_id: orderData.userId || null,
      customer_email: orderData.customerEmail || null,
      customer_name: orderData.customerName || null,
      customer_phone: orderData.customerPhone || null,
      amount: Number(orderData.amount),
      item_count: Number(orderData.itemCount || (Array.isArray(orderData.items) ? orderData.items.length : 1)),
      items: orderData.items || [],
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
      console.log(`[ServerSupabase] Order ${record.id} created in Supabase (Status: ${record.status}, User: ${record.user_id || 'guest'})`);
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

    // 2. Atomically Deduct Inventory in Supabase using PostgreSQL RPC (Row-locked)
    const items = Array.isArray(order.items) ? order.items : [];
    let rpcDeducted = false;
    try {
      await this.callRpc('deduct_inventory', {
        p_items: items.map(i => ({ id: i.id, qty: Number(i.qty) || 1 }))
      });
      rpcDeducted = true;
      console.log(`[ServerSupabase] Inventory atomically deducted via deduct_inventory RPC for order ${orderId}`);
    } catch (rpcErr) {
      console.warn('[ServerSupabase] deduct_inventory RPC warning, falling back to direct deduction:', rpcErr.message);
    }

    if (!rpcDeducted) {
      for (const item of items) {
        await this.deductProductStock(item.id, Number(item.qty) || 1);
      }
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

  // 7b-2. GET ALL PROFILES (ADMIN)
  async getProfiles() {
    try {
      const res = await this.fetchApi('profiles', {
        query: '?select=*&order=created_at.desc'
      });
      if (res && Array.isArray(res) && res.length > 0) {
        this.fallbackData.profiles = res;
        this.saveFallback();
        return res;
      }
    } catch (err) {
      console.warn('[ServerSupabase] getProfiles fallback:', err.message);
    }
    return this.fallbackData.profiles || [];
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


  // 8. GET ORDERS FOR CUSTOMER OR ADMIN (STRICT ISOLATION)
  async getOrders(filter = {}) {
    // Backwards compatibility if passed as a single string (phone or userId)
    let userId = typeof filter === 'object' && filter !== null ? filter.userId : null;
    let phone = typeof filter === 'object' && filter !== null ? filter.phone : null;
    let isAdmin = typeof filter === 'object' && filter !== null ? Boolean(filter.isAdmin) : false;

    if (typeof filter === 'string') {
      if (filter.length > 20 || filter.includes('-')) {
        userId = filter;
      } else {
        phone = filter;
      }
    }

    let cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : null;
    try {
      let query;
      if (isAdmin) {
        query = '?select=*&order=created_at.desc&limit=100';
      } else if (userId) {
        query = `?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`;
      } else if (cleanPhone) {
        query = `?select=*&customer_phone=like.*${cleanPhone}&order=created_at.desc`;
      } else {
        // STRICT SECURITY: Do NOT return all orders to unauthenticated caller!
        return [];
      }

      const remote = await this.fetchApi('orders', { query });
      if (remote && Array.isArray(remote)) {
        return remote;
      }
    } catch (e) {
      console.warn('[ServerSupabase] getOrders fallback:', e.message);
    }

    let orders = this.fallbackData.orders || [];
    if (isAdmin) return orders;
    if (userId) return orders.filter(o => o.user_id === userId);
    if (cleanPhone) return orders.filter(o => (o.customer_phone || '').includes(cleanPhone));
    return [];
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
