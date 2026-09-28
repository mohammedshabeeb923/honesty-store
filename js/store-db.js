/**
 * Honesty Store - Reactive Data Layer & Supabase State Store
 * Synchronizes state between Customer Mobile App, Supabase PostgreSQL, and Admin Console.
 * STRICT ISOLATION: User orders are private to each authenticated user (auth.uid()).
 */

const UI_STORAGE_KEY = 'honesty_store_client_state_v2';

const DEFAULT_PRODUCTS = [
  {
    id: 'upitest',
    name: '₹1 Live UPI Test',
    variant: 'Gateway Verification Item',
    category: 'Chips',
    price: 1,
    stock: 99,
    expectedStock: 99,
    physicalStock: 99,
    image: 'assets/lays.png',
    badge: 'TEST ₹1',
    lowStockThreshold: 5
  },
  {
    id: 'lays',
    name: 'Lays',
    variant: 'Classic Potato Chips',
    category: 'Chips',
    price: 20,
    stock: 18,
    expectedStock: 18,
    physicalStock: 15,
    image: 'assets/lays.png',
    badge: '',
    lowStockThreshold: 5
  },
  {
    id: 'oreo',
    name: 'Oreo',
    variant: 'Chocolate Sandwich Cookies',
    category: 'Biscuits',
    price: 30,
    stock: 3,
    expectedStock: 3,
    physicalStock: 3,
    image: 'assets/oreo.png',
    badge: 'LOW STOCK',
    lowStockThreshold: 5
  },
  {
    id: 'parleg',
    name: 'Parle-G',
    variant: 'Glucose Biscuits',
    category: 'Biscuits',
    price: 10,
    stock: 25,
    expectedStock: 25,
    physicalStock: 25,
    image: 'assets/parleg.png',
    badge: '',
    lowStockThreshold: 5
  },
  {
    id: 'dairymilk',
    name: 'Dairy Milk',
    variant: 'Milk Chocolate Bar',
    category: 'Chocolates',
    price: 20,
    stock: 0,
    expectedStock: 0,
    physicalStock: 0,
    image: 'assets/dairymilk.png',
    badge: 'OUT OF STOCK',
    lowStockThreshold: 3
  }
];

class StoreDB {
  constructor() {
    this.listeners = [];
    this.userOrders = [];       // Private orders for currently authenticated customer
    this.allAdminOrders = [];   // Store-wide orders for authorized admins only

    // Client transient UI state (cart, active filters)
    this.uiState = this.loadUIState();

    this.data = {
      products: DEFAULT_PRODUCTS,
      get orders() {
        // Backwards compatibility: returns current user's isolated orders
        return window.storeDB ? window.storeDB.userOrders : [];
      },
      set orders(val) {
        if (window.storeDB) window.storeDB.userOrders = val;
      },
      community: {
        salesToday: 0,
        storeVisits: 0,
        completedPayments: 0,
        pledgesCount: 0,
        storeLocation: 'Floor 3, Innovation Hub'
      },
      cart: this.uiState.cart || [],
      activeCategory: this.uiState.activeCategory || 'All',
      selectedAuditProductId: this.uiState.selectedAuditProductId || 'lays'
    };

    // Clean up old legacy shared orders storage if present
    try {
      localStorage.removeItem('honesty_store_v1');
    } catch (e) {}

    this.syncWithServer();
  }

  loadUIState() {
    try {
      const raw = localStorage.getItem(UI_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          cart: Array.isArray(parsed.cart) ? parsed.cart : [],
          activeCategory: parsed.activeCategory || 'All',
          selectedAuditProductId: parsed.selectedAuditProductId || 'lays'
        };
      }
    } catch (e) {
      console.warn('[StoreDB] Could not load client state:', e);
    }
    return { cart: [], activeCategory: 'All', selectedAuditProductId: 'lays' };
  }

  save() {
    try {
      // Save only transient UI state to localStorage
      const toSave = {
        cart: this.data.cart,
        activeCategory: this.data.activeCategory,
        selectedAuditProductId: this.data.selectedAuditProductId
      };
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('[StoreDB] Could not save UI state:', e);
    }
    this.notify();
  }

  // ============================================================
  // AUTHORITATIVE SYNCHRONIZATION WITH SUPABASE
  // ============================================================

  async syncWithServer() {
    try {
      // 1. Fetch live products from Supabase
      await this.fetchProductsFromSupabase();

      // 2. Fetch community metrics
      await this.fetchCommunityMetrics();

      // 3. If a customer is logged in, fetch ONLY their private orders
      const currentUserId = window.authManager ? window.authManager.getUserId() : null;
      if (currentUserId) {
        await this.loadUserOrders(currentUserId);
      } else {
        this.userOrders = [];
      }

      // 4. If admin console is open and user is admin, fetch all admin orders
      if (window.authManager && window.authManager.isAdmin()) {
        await this.loadAdminOrders();
      }

      this.notify();
    } catch (err) {
      console.warn('[StoreDB] Sync with server skipped (offline or booting):', err.message);
    }
  }

  async fetchProductsFromSupabase() {
    try {
      let products = [];
      if (window.supabaseClient && window.supabaseClient.isConnected) {
        products = await window.supabaseClient.fetchProducts();
      }

      if (!products || products.length === 0) {
        const res = await fetch('/api/products');
        if (res.ok) {
          const body = await res.json();
          if (body.success && Array.isArray(body.products)) {
            products = body.products;
          }
        }
      }

      if (Array.isArray(products) && products.length > 0) {
        this.data.products = products.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          variant: p.variant || '',
          category: p.category || 'Chips',
          price: Number(p.price) || 0,
          sellingPrice: (p.selling_price !== null && p.selling_price !== undefined) ? Number(p.selling_price) : (p.sellingPrice !== undefined ? Number(p.sellingPrice) : null),
          stock: Number(p.stock) || 0,
          expectedStock: Number(p.expected_stock !== undefined ? p.expected_stock : p.stock) || 0,
          physicalStock: Number(p.physical_stock !== undefined ? p.physical_stock : p.stock) || 0,
          image: p.image_url || p.imageUrl || p.image || 'assets/lays.png',
          imageUrl: p.image_url || p.imageUrl || p.image || 'assets/lays.png',
          storagePath: p.storage_path || p.storagePath || null,
          isActive: p.is_active !== undefined ? Boolean(p.is_active) : (p.isActive !== undefined ? Boolean(p.isActive) : true),
          badge: Number(p.stock) <= 0 ? 'OUT OF STOCK' : (Number(p.stock) <= (p.low_stock_threshold || 5) ? 'LOW STOCK' : ''),
          lowStockThreshold: p.low_stock_threshold || p.lowStockThreshold || 5,
          createdAt: p.created_at || null,
          updatedAt: p.updated_at || null
        }));
      }
    } catch (e) {
      console.warn('[StoreDB] Could not sync products:', e);
    }
  }

  async fetchCommunityMetrics() {
    try {
      const metricRes = await fetch('/api/community-metrics');
      if (metricRes.ok) {
        const metricData = await metricRes.json();
        if (metricData.success && metricData.metrics) {
          const m = metricData.metrics;
          this.data.community.salesToday = Number(m.sales_today) || 0;
          this.data.community.storeVisits = Number(m.store_visits) || 0;
          this.data.community.completedPayments = Number(m.completed_payments) || 0;
        }
      }
    } catch (e) {}
  }

  /**
   * Load orders strictly belonging to the authenticated customer
   */
  async loadUserOrders(userId) {
    if (!userId) {
      this.userOrders = [];
      this.notify();
      return;
    }

    try {
      let rawOrders = [];

      // 1. Try Supabase Client (RLS enforces user_id = auth.uid())
      if (window.supabaseClient && window.supabaseClient.isConnected) {
        rawOrders = await window.supabaseClient.getUserOrders(userId);
      }

      // 2. Fallback to authenticated backend API
      if (!rawOrders || rawOrders.length === 0) {
        const token = window.authManager ? window.authManager.getAccessToken() : '';
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`/api/orders?userId=${encodeURIComponent(userId)}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.orders)) {
            rawOrders = data.orders;
          }
        }
      }

      this.userOrders = (rawOrders || []).map(o => this.formatOrder(o));
      this.notify();
    } catch (e) {
      console.warn('[StoreDB] Could not load user orders:', e);
    }
  }

  clearUserOrders() {
    this.userOrders = [];
    this.notify();
  }

  /**
   * Load all orders for store administrators (Admin console)
   */
  async loadAdminOrders() {
    try {
      let rawOrders = [];
      if (window.supabaseClient && window.supabaseClient.isConnected) {
        rawOrders = await window.supabaseClient.getAllOrders();
      }

      if (!rawOrders || rawOrders.length === 0) {
        const adminToken = localStorage.getItem('honesty_admin_token') || (window.authManager ? window.authManager.getAccessToken() : '');
        const headers = adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
        const res = await fetch('/api/admin/orders', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.orders)) {
            rawOrders = data.orders;
          }
        }
      }

      this.allAdminOrders = (rawOrders || []).map(o => this.formatOrder(o));
      this.notify();
    } catch (e) {
      console.warn('[StoreDB] Could not load admin orders:', e);
    }
  }

  formatOrder(o) {
    const createdAt = o.created_at || new Date().toISOString();
    return {
      id: o.id,
      userId: o.user_id,
      customerEmail: o.customer_email || '',
      customerName: o.customer_name || '',
      timeLabel: o.time_label || new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt,
      amount: Number(o.amount) || 0,
      itemCount: Number(o.item_count) || (Array.isArray(o.items) ? o.items.length : 1),
      status: o.status || 'PAID',
      paymentMethod: o.payment_method || 'UPI',
      paymentGateway: o.payment_gateway || 'Cashfree',
      items: Array.isArray(o.items) ? o.items : []
    };
  }

  // ============================================================
  // REALTIME EVENT HANDLERS
  // ============================================================

  handleRealtimeProductUpdate(payload) {
    if (!payload) return;
    const newProd = payload.new;
    if (!newProd) return;

    const existing = this.getProduct(newProd.id);
    if (existing) {
      existing.stock = Number(newProd.stock);
      existing.expectedStock = Number(newProd.expected_stock !== undefined ? newProd.expected_stock : newProd.stock);
      existing.physicalStock = Number(newProd.physical_stock !== undefined ? newProd.physical_stock : newProd.stock);
      existing.badge = existing.stock <= 0 ? 'OUT OF STOCK' : (existing.stock <= (newProd.low_stock_threshold || 5) ? 'LOW STOCK' : '');
    } else {
      this.data.products.push({
        id: newProd.id,
        name: newProd.name,
        variant: newProd.variant || '',
        category: newProd.category || 'Chips',
        price: Number(newProd.price) || 0,
        stock: Number(newProd.stock) || 0,
        expectedStock: Number(newProd.stock) || 0,
        physicalStock: Number(newProd.stock) || 0,
        image: newProd.image_url || 'assets/lays.png',
        badge: Number(newProd.stock) <= 0 ? 'OUT OF STOCK' : '',
        lowStockThreshold: newProd.low_stock_threshold || 5
      });
    }
    this.notify();
  }

  handleRealtimeOrderUpdate(payload) {
    if (!payload || !payload.new) return;
    const formatted = this.formatOrder(payload.new);

    // 1. If order belongs to current user, prepend to customer order history
    const currentUserId = window.authManager ? window.authManager.getUserId() : null;
    if (currentUserId && formatted.userId === currentUserId) {
      if (!this.userOrders.some(o => o.id === formatted.id)) {
        this.userOrders.unshift(formatted);
      }
    }

    // 2. Prepend to admin orders list if active
    if (!this.allAdminOrders.some(o => o.id === formatted.id)) {
      this.allAdminOrders.unshift(formatted);
    }

    // 3. Update Community Metrics in memory
    this.data.community.salesToday += formatted.amount;
    this.data.community.completedPayments += 1;

    this.notify();
  }

  // ============================================================
  // OBSERVER PATTERN
  // ============================================================

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => {
      try {
        cb(this.data);
      } catch (err) {
        console.error('[StoreDB] Listener error:', err);
      }
    });
  }

  // ============================================================
  // CATALOG & CART METHODS
  // ============================================================

  getProducts(category = 'All', includeArchived = false) {
    let list = this.data.products || [];
    if (!includeArchived) {
      list = list.filter(p => p.isActive !== false);
    }
    if (!category || category === 'All') return list;
    return list.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
  }

  getProduct(id) {
    return this.data.products.find(p => p.id === id);
  }

  async addProduct(newProduct) {
    const id = newProduct.id || ('prod_' + Date.now());
    const product = {
      id,
      name: newProduct.name,
      description: newProduct.description || '',
      variant: newProduct.variant || '',
      category: newProduct.category || 'Chips',
      price: Number(newProduct.price) || 10,
      selling_price: newProduct.sellingPrice !== undefined ? Number(newProduct.sellingPrice) : (newProduct.selling_price !== undefined ? Number(newProduct.selling_price) : Number(newProduct.price)),
      stock: Math.max(0, parseInt(newProduct.stock, 10) || 0),
      expected_stock: Math.max(0, parseInt(newProduct.stock, 10) || 0),
      physical_stock: Math.max(0, parseInt(newProduct.stock, 10) || 0),
      image_url: newProduct.image || newProduct.imageUrl || newProduct.image_url || 'assets/lays.png',
      storage_path: newProduct.storagePath || newProduct.storage_path || null,
      low_stock_threshold: parseInt(newProduct.lowStockThreshold || newProduct.low_stock_threshold, 10) || 5,
      is_active: newProduct.isActive !== undefined ? Boolean(newProduct.isActive) : true
    };

    if (window.supabaseClient) {
      await window.supabaseClient.addProduct(product);
    } else {
      const adminToken = localStorage.getItem('honesty_admin_token') || '';
      await fetch('/api/admin/add-product', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify(product)
      });
    }

    await this.fetchProductsFromSupabase();
    this.notify();
    return this.getProduct(id) || product;
  }

  async updateProduct(id, updates) {
    if (window.supabaseClient) {
      await window.supabaseClient.updateProduct(id, updates);
    } else {
      const adminToken = localStorage.getItem('honesty_admin_token') || '';
      await fetch('/api/admin/update-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ id, ...updates })
      });
    }

    await this.fetchProductsFromSupabase();
    this.notify();
    return this.getProduct(id);
  }

  async archiveProduct(id, isActive = false) {
    if (window.supabaseClient) {
      await window.supabaseClient.archiveProduct(id, isActive);
    } else {
      const adminToken = localStorage.getItem('honesty_admin_token') || '';
      await fetch('/api/admin/archive-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ id, isActive })
      });
    }

    await this.fetchProductsFromSupabase();
    this.notify();
    return this.getProduct(id);
  }

  async canDeleteProduct(id) {
    if (window.supabaseClient) {
      return await window.supabaseClient.canDeleteProduct(id);
    }
    const adminToken = localStorage.getItem('honesty_admin_token') || '';
    const res = await fetch('/api/admin/can-delete-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
      },
      body: JSON.stringify({ id })
    });
    const result = await res.json();
    return result.canDelete !== false;
  }

  async deleteProduct(id) {
    if (window.supabaseClient) {
      await window.supabaseClient.deleteProduct(id);
    } else {
      const adminToken = localStorage.getItem('honesty_admin_token') || '';
      const res = await fetch('/api/admin/delete-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ id })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete product');
    }

    await this.fetchProductsFromSupabase();
    this.notify();
    return { success: true, id };
  }

  getCart() {
    return this.data.cart || [];
  }

  addToCart(productId) {
    const product = this.getProduct(productId);
    if (!product || product.stock <= 0 || product.isActive === false) return false;

    const unitPrice = (product.sellingPrice !== null && product.sellingPrice !== undefined) ? product.sellingPrice : product.price;

    let cartItem = this.data.cart.find(item => item.id === productId);
    if (cartItem) {
      if (cartItem.qty < product.stock) {
        cartItem.qty += 1;
      } else {
        return false;
      }
    } else {
      this.data.cart.push({
        id: product.id,
        name: product.name,
        variant: product.variant,
        price: unitPrice,
        originalPrice: product.price,
        image: product.image,
        qty: 1
      });
    }
    this.save();
    return true;
  }

  updateCartQty(productId, delta) {
    const cartItem = this.data.cart.find(item => item.id === productId);
    const product = this.getProduct(productId);
    if (!cartItem) return;

    cartItem.qty += delta;
    if (cartItem.qty <= 0) {
      this.data.cart = this.data.cart.filter(item => item.id !== productId);
    } else if (product && cartItem.qty > product.stock) {
      cartItem.qty = product.stock;
    }
    this.save();
  }

  clearCart() {
    this.data.cart = [];
    this.save();
  }

  getCartTotal() {
    const total = this.data.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const count = this.data.cart.reduce((sum, item) => sum + item.qty, 0);
    return { total, count };
  }

  // ============================================================
  // ORDERS MANAGEMENT
  // ============================================================

  getUserOrders() {
    return this.userOrders;
  }

  getAdminOrders() {
    return this.allAdminOrders;
  }

  /**
   * Called locally after successful Cashfree payment confirmation
   */
  recordConfirmedOrder(serverOrder) {
    if (!serverOrder) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const formattedOrder = {
      id: serverOrder.id,
      userId: serverOrder.user_id || (window.authManager ? window.authManager.getUserId() : null),
      customerEmail: serverOrder.customer_email || (window.authManager ? window.authManager.getUserEmail() : ''),
      customerName: serverOrder.customer_name || (window.authManager ? window.authManager.getUserName() : ''),
      timeLabel: `TODAY, ${timeStr.toUpperCase()}`,
      createdAt: serverOrder.created_at || now.toISOString(),
      amount: Number(serverOrder.amount),
      itemCount: Number(serverOrder.item_count || (serverOrder.items ? serverOrder.items.length : 1)),
      status: 'PAID',
      paymentMethod: serverOrder.payment_method || 'Cashfree UPI',
      paymentGateway: 'Cashfree',
      items: serverOrder.items || []
    };

    // Deduct stock in memory immediately
    if (Array.isArray(formattedOrder.items)) {
      formattedOrder.items.forEach(item => {
        const prod = this.getProduct(item.id);
        if (prod) {
          prod.stock = Math.max(0, prod.stock - item.qty);
          prod.expectedStock = prod.stock;
          prod.physicalStock = Math.max(0, prod.physicalStock - item.qty);
          prod.badge = prod.stock === 0 ? 'OUT OF STOCK' : (prod.stock <= prod.lowStockThreshold ? 'LOW STOCK' : '');
        }
      });
    }

    // Add only to the current user's isolated orders
    if (!this.userOrders.some(o => o.id === formattedOrder.id)) {
      this.userOrders.unshift(formattedOrder);
    }

    // Clear user cart
    this.data.cart = [];
    this.save();

    return formattedOrder;
  }

  // ============================================================
  // AUDITS & STOCK RECONCILIATIONS
  // ============================================================

  getSelectedAuditProduct() {
    const id = this.data.selectedAuditProductId || 'lays';
    return this.getProduct(id) || this.data.products[0];
  }

  setSelectedAuditProduct(id) {
    this.data.selectedAuditProductId = id;
    this.save();
  }

  updatePhysicalStock(productId, physicalCount) {
    const prod = this.getProduct(productId);
    if (!prod) return;
    prod.physicalStock = Number(physicalCount);
    this.save();
  }

  async adjustStock(productId, newStockLevel, auditNote = '') {
    const prod = this.getProduct(productId);
    if (!prod) return;

    prod.stock = Number(newStockLevel);
    prod.expectedStock = Number(newStockLevel);
    prod.physicalStock = Number(newStockLevel);
    prod.badge = prod.stock === 0 ? 'OUT OF STOCK' : (prod.stock <= prod.lowStockThreshold ? 'LOW STOCK' : '');

    this.save();

    // Persist to Supabase directly if available
    if (window.supabaseClient && window.supabaseClient.isConnected) {
      try {
        await window.supabaseClient.updateProduct(productId, {
          stock: Number(newStockLevel),
          expected_stock: Number(newStockLevel),
          physical_stock: Number(newStockLevel)
        });
      } catch (e) {
        console.warn('[StoreDB] Could not update product in Supabase directly:', e);
      }
    }

    // Persist via server API
    try {
      const adminToken = localStorage.getItem('honesty_admin_token') || '';
      await fetch('/api/admin/adjust-stock', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({
          productId,
          newStockLevel: Number(newStockLevel),
          auditNote,
          auditedBy: window.authManager ? window.authManager.getUserEmail() : 'Admin'
        })
      });
    } catch (e) {
      console.warn('[StoreDB] Could not persist stock adjustment to backend:', e);
    }

    await this.fetchProductsFromSupabase();
    this.notify();
  }

  logVisit() {
    this.data.community.storeVisits += 1;
    this.save();
  }

  signHonorPledge() {
    this.data.community.pledgesCount = (this.data.community.pledgesCount || 0) + 1;
    this.save();
  }
}

window.storeDB = new StoreDB();
