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

// Initial Product Master (from packing slip: Gross ₹1,914.38, Net ₹1,914.50)
const DEFAULT_PRODUCTS = [
  {
    id: 'lays',
    name: 'Lays',
    reference_name: 'LAYS RS 5',
    variant: 'Classic Potato Chips (₹5)',
    category: 'Chips',
    price: 5.00,
    purchase_price: 4.38,
    selling_price: 5.00,
    stock: 110,
    expected_stock: 110,
    physical_stock: 110,
    low_stock_threshold: 10,
    image_url: 'assets/lays.jpg',
    is_active: true,
    is_available: true,
    description: 'Classic salted crispy potato chips. Reference: LAYS RS 5 @ ₹4.38'
  },
  {
    id: 'dailee_mango',
    name: 'Dailee Mango',
    reference_name: 'DAILEE [MANGO 12]',
    variant: 'Mango Drink (12 Pack)',
    category: 'Beverages',
    price: 10.00,
    purchase_price: 7.00,
    selling_price: 10.00,
    stock: 22,
    expected_stock: 22,
    physical_stock: 22,
    low_stock_threshold: 5,
    image_url: 'assets/dailee_mango.jpg',
    is_active: true,
    is_available: true,
    description: 'Refreshing mango fruit juice drink. Reference: DAILEE [MANGO 12] @ ₹7.00'
  },
  {
    id: 'oreo',
    name: 'Oreo',
    reference_name: 'OREO RS 10',
    variant: 'Vanilla Creme Cookies (₹10)',
    category: 'Biscuits',
    price: 10.00,
    purchase_price: 8.86,
    selling_price: 10.00,
    stock: 44,
    expected_stock: 44,
    physical_stock: 44,
    low_stock_threshold: 8,
    image_url: 'assets/oreo.jpg',
    is_active: true,
    is_available: true,
    description: 'Rich chocolate cookies with sweet vanilla creme. Reference: OREO RS 10 @ ₹8.86'
  },
  {
    id: 'munch',
    name: 'Munch',
    reference_name: 'MUNCH RS 10 [BOX]',
    variant: 'Chocolate Coated Wafer Box',
    category: 'Chocolates',
    price: 209.00,
    purchase_price: 209.00,
    selling_price: null, // Requires Admin Input
    stock: 1,
    expected_stock: 1,
    physical_stock: 1,
    low_stock_threshold: 1,
    image_url: 'assets/munch.jpg',
    is_active: true,
    is_available: true,
    description: 'Crispy chocolate wafer box. Reference: MUNCH RS 10 [BOX] @ ₹209.00. Selling price requires admin input.'
  },
  {
    id: 'snickers',
    name: 'Snickers',
    reference_name: 'SNICKERS [10] 40PES',
    variant: 'Peanut & Caramel (₹10)',
    category: 'Chocolates',
    price: 10.00,
    purchase_price: 7.88,
    selling_price: 10.00,
    stock: 58,
    expected_stock: 58,
    physical_stock: 58,
    low_stock_threshold: 10,
    image_url: 'assets/snickers.jpg',
    is_active: true,
    is_available: true,
    description: 'Milk chocolate bar with roasted peanuts and caramel. Reference: SNICKERS [10] 40PES @ ₹7.88'
  },
  {
    id: 'bournvita_biscuit',
    name: 'Bournvita Biscuit',
    reference_name: 'BOURNVITA BISCUIT [10]',
    variant: 'Malted Chocolate Cookies (₹10)',
    category: 'Biscuits',
    price: 10.00,
    purchase_price: 8.50,
    selling_price: 10.00,
    stock: 9,
    expected_stock: 9,
    physical_stock: 9,
    low_stock_threshold: 4,
    image_url: 'assets/bournvita.jpg',
    is_active: true,
    is_available: true,
    description: 'Wholesome malted chocolate cookies. Reference: BOURNVITA BISCUIT [10] @ ₹8.50'
  },
  {
    id: 'chocos',
    name: 'Chocos',
    reference_name: 'CHOCOS RS 10',
    variant: 'Chocolate Cereal Snack (₹10)',
    category: 'Snacks',
    price: 10.00,
    purchase_price: 8.60,
    selling_price: 10.00,
    stock: 17,
    expected_stock: 17,
    physical_stock: 17,
    low_stock_threshold: 5,
    image_url: 'assets/chocos.jpg',
    is_active: true,
    is_available: true,
    description: 'Crunchy chocolate flavoured snack. Reference: CHOCOS RS 10 @ ₹8.60'
  },
  {
    id: 'upitest',
    name: '₹1 Live UPI Test',
    reference_name: 'GATEWAY VERIFICATION ITEM',
    variant: 'Gateway Verification Item',
    category: 'Chips',
    price: 1.00,
    purchase_price: 1.00,
    selling_price: 1.00,
    stock: 99,
    expected_stock: 99,
    physical_stock: 99,
    low_stock_threshold: 5,
    image_url: 'assets/lays.png',
    is_active: true,
    is_available: true,
    description: 'Live ₹1 gateway testing item.'
  }
];

function resolveProductImage(img, id = '') {
  const s = String(img || '').toLowerCase();
  const idStr = String(id || '').toLowerCase();
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
    return img;
  }
  if (s.includes('bournvita') || idStr.includes('bournvita')) return 'assets/bournvita.jpg';
  if (s.includes('chocos') || idStr.includes('chocos')) return 'assets/chocos.jpg';
  if (s.includes('dailee') || idStr.includes('dailee')) return 'assets/dailee_mango.jpg';
  if (s.includes('munch') || idStr.includes('munch')) return 'assets/munch.jpg';
  if (s.includes('snickers') || idStr.includes('snickers')) return 'assets/snickers.jpg';
  if (s.includes('oreo') || idStr.includes('oreo')) return 'assets/oreo.jpg';
  if (s.includes('lays') || s.includes('lay') || idStr.includes('lays')) return 'assets/lays.jpg';
  if (s.includes('dairymilk') || idStr.includes('dairymilk')) return 'assets/dairymilk.png';
  if (s.includes('parleg') || idStr.includes('parleg')) return 'assets/parleg.png';
  return img || 'assets/lays.jpg';
}

class ServerSupabase {
  constructor() {
    this.fallbackData = this.loadFallback();
    this.seedInitialMaster();
    this.syncAdminUsers().catch(() => {});
  }

  async syncAdminUsers(adminEmails = ['godson107111@gmail.com', 'mohammedshabeeb923@gmail.com', 'shahidkkvl@gmail.com']) {
    try {
      for (const email of adminEmails) {
        await this.fetchApi('admin_users', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: { email: email.toLowerCase().trim(), role: 'admin' }
        });
      }
    } catch (e) {
      // Table may not exist yet or offline
    }
  }

  getEnv() {
    return {
      url: (process.env.SUPABASE_URL || 'https://hiolzzvqcgernfebgdbm.supabase.co').replace(/\/+$/, ''),
      key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpb2x6enZxY2dlcm5mZWJnZGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzAwOTIsImV4cCI6MjEwNTg0NjA5Mn0.3q_2KhFenDVen1MuCZxXf87QpqA10GLWY0q4YFzLTUY'
    };
  }

  loadFallback() {
    let data = null;
    try {
      if (fs.existsSync(FALLBACK_DB_FILE)) {
        data = JSON.parse(fs.readFileSync(FALLBACK_DB_FILE, 'utf-8'));
      }
    } catch (e) {}
    if (!data) {
      data = {
        products: DEFAULT_PRODUCTS,
        orders: [],
        profiles: [],
        stock_audits: [],
        community_metrics: { sales_today: 0, store_visits: 0, completed_payments: 0 }
      };
    }
    if (!Array.isArray(data.deleted_product_ids)) {
      data.deleted_product_ids = [];
    }
    return data;
  }

  saveFallback() {
    try {
      fs.writeFileSync(FALLBACK_DB_FILE, JSON.stringify(this.fallbackData, null, 2));
    } catch (e) {}
  }

  seedInitialMaster() {
    if (!this.fallbackData.products) this.fallbackData.products = [];
    const deletedIds = new Set(this.fallbackData.deleted_product_ids || []);

    // Ensure products from packing slip master exist unless explicitly deleted by admin
    for (const master of DEFAULT_PRODUCTS) {
      if (deletedIds.has(master.id)) continue;

      const idx = this.fallbackData.products.findIndex(p => p.id === master.id);
      if (idx >= 0) {
        const cur = this.fallbackData.products[idx];
        this.fallbackData.products[idx] = {
          ...cur,
          name: cur.name || master.name,
          reference_name: cur.reference_name || master.reference_name,
          purchase_price: cur.purchase_price !== undefined ? cur.purchase_price : master.purchase_price,
          selling_price: cur.selling_price !== undefined ? cur.selling_price : master.selling_price,
          price: cur.price !== undefined ? cur.price : master.price,
          stock: cur.stock !== undefined ? cur.stock : master.stock,
          expected_stock: cur.expected_stock !== undefined ? cur.expected_stock : master.stock,
          physical_stock: cur.physical_stock !== undefined ? cur.physical_stock : master.stock,
          image_url: cur.image_url || master.image_url,
          is_active: cur.is_active !== undefined ? cur.is_active : true,
          is_available: cur.is_available !== undefined ? cur.is_available : true,
          description: cur.description || master.description
        };
      } else {
        this.fallbackData.products.push({ ...master });
      }
    }
    this.saveFallback();
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
    const deletedIds = new Set(this.fallbackData.deleted_product_ids || []);
    try {
      const query = includeArchived 
        ? '?select=*&order=name.asc' 
        : '?select=*&is_active=eq.true&order=name.asc';
      const products = await this.fetchApi('products', { query });
      if (products && Array.isArray(products) && products.length > 0) {
        // Merge with master packing slip catalog definitions and local modifications
        const merged = products
          .filter(remoteP => !deletedIds.has(remoteP.id))
          .map(remoteP => {
            const master = DEFAULT_PRODUCTS.find(d => d.id === remoteP.id);
            const localMatch = (this.fallbackData.products || []).find(p => p.id === remoteP.id);
            const resolvedImg = resolveProductImage(
              (localMatch && localMatch.image_url) || remoteP.image_url || (master && master.image_url),
              remoteP.id
            );

            // Authoritative stock: local/fallback state takes precedence if updated by admin
            const stockVal = (localMatch && localMatch.stock !== undefined)
              ? Number(localMatch.stock)
              : (remoteP.stock !== undefined ? Number(remoteP.stock) : (master ? master.stock : 0));
            const expectedStockVal = (localMatch && localMatch.expected_stock !== undefined)
              ? Number(localMatch.expected_stock)
              : (remoteP.expected_stock !== undefined ? Number(remoteP.expected_stock) : stockVal);
            const physicalStockVal = (localMatch && localMatch.physical_stock !== undefined)
              ? Number(localMatch.physical_stock)
              : (remoteP.physical_stock !== undefined ? Number(remoteP.physical_stock) : stockVal);

            const sellingPriceVal = (localMatch && localMatch.selling_price !== undefined)
              ? localMatch.selling_price
              : ((remoteP.selling_price !== undefined && remoteP.selling_price !== null) ? Number(remoteP.selling_price) : (master ? master.selling_price : null));
            const purchasePriceVal = (localMatch && localMatch.purchase_price !== undefined)
              ? localMatch.purchase_price
              : ((remoteP.purchase_price !== undefined && remoteP.purchase_price !== null) ? Number(remoteP.purchase_price) : (master ? master.purchase_price : null));
            const priceVal = (localMatch && localMatch.price !== undefined)
              ? localMatch.price
              : ((remoteP.price !== undefined && remoteP.price !== null) ? Number(remoteP.price) : (master ? master.price : 10));

            const isActiveVal = (localMatch && localMatch.is_active !== undefined)
              ? Boolean(localMatch.is_active)
              : (remoteP.is_active !== undefined ? Boolean(remoteP.is_active) : (master ? master.is_active : true));
            const isAvailableVal = (localMatch && localMatch.is_available !== undefined)
              ? Boolean(localMatch.is_available)
              : (remoteP.is_available !== undefined ? Boolean(remoteP.is_available) : (master ? master.is_available : true));

            return {
              ...(master || {}),
              ...remoteP,
              ...(localMatch || {}),
              id: remoteP.id,
              name: (localMatch && localMatch.name) || remoteP.name || (master ? master.name : ''),
              reference_name: (localMatch && localMatch.reference_name) || remoteP.reference_name || (master ? master.reference_name : null),
              variant: (localMatch && localMatch.variant) || remoteP.variant || (master ? master.variant : ''),
              category: (localMatch && localMatch.category) || remoteP.category || (master ? master.category : 'Chips'),
              description: (localMatch && localMatch.description) || remoteP.description || (master ? master.description : ''),
              price: priceVal,
              purchase_price: purchasePriceVal,
              selling_price: sellingPriceVal,
              stock: stockVal,
              expected_stock: expectedStockVal,
              physical_stock: physicalStockVal,
              is_active: isActiveVal,
              is_available: isAvailableVal,
              image_url: resolvedImg,
              low_stock_threshold: (localMatch && localMatch.low_stock_threshold) || remoteP.low_stock_threshold || (master ? master.low_stock_threshold : 5)
            };
          });

        const remoteIds = new Set(products.map(p => p.id));
        const missingMasters = DEFAULT_PRODUCTS.filter(m => !remoteIds.has(m.id) && !deletedIds.has(m.id));
        const localOnly = (this.fallbackData.products || []).filter(p => !remoteIds.has(p.id) && !DEFAULT_PRODUCTS.some(m => m.id === p.id) && !deletedIds.has(p.id));

        this.fallbackData.products = [...merged, ...missingMasters, ...localOnly];
        this.saveFallback();
        return includeArchived ? this.fallbackData.products : this.fallbackData.products.filter(p => p.is_active !== false);
      }
    } catch (err) {
      console.warn('[ServerSupabase] getProducts fallback:', err.message);
    }
    const fallbackList = (this.fallbackData.products || DEFAULT_PRODUCTS).filter(p => !deletedIds.has(p.id));
    return includeArchived ? fallbackList : fallbackList.filter(p => p.is_active !== false);
  }

  // 2. GET SINGLE PRODUCT
  async getProduct(productId) {
    if ((this.fallbackData.deleted_product_ids || []).includes(productId)) {
      return null;
    }
    const localMatch = (this.fallbackData.products || []).find(p => p.id === productId);
    try {
      const res = await this.fetchApi('products', {
        query: `?id=eq.${productId}&select=*`
      });
      if (res && res.length > 0) {
        const remoteP = res[0];
        const master = DEFAULT_PRODUCTS.find(d => d.id === remoteP.id);
        const resolvedImg = resolveProductImage(
          (localMatch && localMatch.image_url) || remoteP.image_url || (master && master.image_url),
          remoteP.id
        );
        return {
          ...(master || {}),
          ...remoteP,
          ...(localMatch || {}),
          id: remoteP.id,
          image_url: resolvedImg
        };
      }
    } catch (err) {
      console.warn(`[ServerSupabase] getProduct(${productId}) fallback:`, err.message);
    }
    return localMatch || null;
  }

  // 2b. ADD NEW PRODUCT (ADMIN)
  async addProduct(productData) {
    const id = productData.id || ('prod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    const price = Math.max(0.5, Number(productData.price) || 10);
    const sellingPrice = (productData.selling_price !== undefined && productData.selling_price !== null && productData.selling_price !== '') 
      ? Number(productData.selling_price) 
      : ((productData.sellingPrice !== undefined && productData.sellingPrice !== null && productData.sellingPrice !== '') ? Number(productData.sellingPrice) : null);
    const purchasePrice = (productData.purchase_price !== undefined && productData.purchase_price !== null && productData.purchase_price !== '')
      ? Number(productData.purchase_price)
      : ((productData.purchasePrice !== undefined && productData.purchasePrice !== null && productData.purchasePrice !== '') ? Number(productData.purchasePrice) : null);
    const stock = Math.max(0, parseInt(productData.stock, 10) || 0);

    const record = {
      id,
      name: (productData.name || 'Snack Item').trim(),
      reference_name: (productData.reference_name || productData.referenceName || '').trim() || null,
      description: (productData.description || '').trim(),
      variant: (productData.variant || '').trim(),
      category: productData.category || 'Chips',
      price: price,
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      stock: stock,
      expected_stock: stock,
      physical_stock: stock,
      low_stock_threshold: Math.max(1, parseInt(productData.low_stock_threshold || productData.lowStockThreshold, 10) || 5),
      image_url: productData.image_url || productData.imageUrl || productData.image || 'assets/lays.png',
      storage_path: productData.storage_path || productData.storagePath || null,
      is_active: productData.is_active !== undefined ? Boolean(productData.is_active) : (productData.isActive !== undefined ? Boolean(productData.isActive) : true),
      is_available: productData.is_available !== undefined ? Boolean(productData.is_available) : (productData.isAvailable !== undefined ? Boolean(productData.isAvailable) : true),
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
    if (updates.reference_name !== undefined) patchPayload.reference_name = updates.reference_name ? updates.reference_name.trim() : null;
    if (updates.referenceName !== undefined) patchPayload.reference_name = updates.referenceName ? updates.referenceName.trim() : null;
    if (updates.description !== undefined) patchPayload.description = updates.description.trim();
    if (updates.variant !== undefined) patchPayload.variant = updates.variant.trim();
    if (updates.category !== undefined) patchPayload.category = updates.category;
    if (updates.price !== undefined) patchPayload.price = Math.max(0.5, Number(updates.price));
    if (updates.purchase_price !== undefined) patchPayload.purchase_price = (updates.purchase_price !== null && updates.purchase_price !== '') ? Number(updates.purchase_price) : null;
    if (updates.purchasePrice !== undefined) patchPayload.purchase_price = (updates.purchasePrice !== null && updates.purchasePrice !== '') ? Number(updates.purchasePrice) : null;
    if (updates.selling_price !== undefined) patchPayload.selling_price = (updates.selling_price !== null && updates.selling_price !== '') ? Number(updates.selling_price) : null;
    if (updates.sellingPrice !== undefined) patchPayload.selling_price = (updates.sellingPrice !== null && updates.sellingPrice !== '') ? Number(updates.sellingPrice) : null;
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
    if (updates.is_available !== undefined) patchPayload.is_available = Boolean(updates.is_available);
    if (updates.isAvailable !== undefined) patchPayload.is_available = Boolean(updates.isAvailable);

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
          delete safePayload.reference_name;
          delete safePayload.purchase_price;
          delete safePayload.selling_price;
          delete safePayload.is_available;
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

    // Track permanently deleted product ID so it is never re-seeded or resurrected
    if (!Array.isArray(this.fallbackData.deleted_product_ids)) {
      this.fallbackData.deleted_product_ids = [];
    }
    if (!this.fallbackData.deleted_product_ids.includes(productId)) {
      this.fallbackData.deleted_product_ids.push(productId);
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

  // 9b. UPDATE PHYSICAL SHELF STOCK (ADMIN)
  async updatePhysicalStock(productId, physicalStock) {
    const numPhysical = Math.max(0, Number(physicalStock) || 0);
    const localProd = (this.fallbackData.products || []).find(p => p.id === productId);
    if (localProd) {
      localProd.physical_stock = numPhysical;
      localProd.updated_at = new Date().toISOString();
      this.saveFallback();
    }
    try {
      await this.fetchApi('products', {
        method: 'PATCH',
        query: `?id=eq.${productId}`,
        body: { physical_stock: numPhysical, updated_at: new Date().toISOString() }
      });
    } catch (e) {}
    return { success: true, productId, physicalStock: numPhysical };
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
