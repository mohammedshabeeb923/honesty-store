/**
 * Honesty Store - Reactive Data Layer & Supabase State Store
 * Synchronizes state between Customer Mobile App, Supabase PostgreSQL, and Admin Console
 */

const STORAGE_KEY = 'honesty_store_v1';

const DEFAULT_DATA = {
  products: [
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
  ],
  orders: [],
  community: {
    salesToday: 0,
    storeVisits: 0,
    completedPayments: 0,
    pledgesCount: 0,
    storeLocation: 'Floor 3, Innovation Hub'
  },
  cart: [],
  activeCategory: 'All',
  selectedAuditProductId: 'lays'
};

class StoreDB {
  constructor() {
    this.listeners = [];
    this.data = this.load();
    this.syncWithServer();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_DATA, ...parsed };
      }
    } catch (e) {
      console.warn('Could not read from localStorage', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Could not save to localStorage', e);
    }
    this.notify();
  }

  // Authoritative server synchronization with Supabase & Cashfree backend
  async syncWithServer() {
    try {
      // 1. Fetch live products from Supabase
      const prodRes = await fetch('/api/products');
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        if (prodData.success && Array.isArray(prodData.products) && prodData.products.length > 0) {
          this.data.products = prodData.products.map(p => ({
            id: p.id,
            name: p.name,
            variant: p.variant || '',
            category: p.category || 'Chips',
            price: Number(p.price) || 0,
            stock: Number(p.stock) || 0,
            expectedStock: Number(p.expected_stock !== undefined ? p.expected_stock : p.stock) || 0,
            physicalStock: Number(p.physical_stock !== undefined ? p.physical_stock : p.stock) || 0,
            image: p.image_url || p.image || 'assets/lays.png',
            badge: Number(p.stock) <= 0 ? 'OUT OF STOCK' : (Number(p.stock) <= (p.low_stock_threshold || 5) ? 'LOW STOCK' : ''),
            lowStockThreshold: p.low_stock_threshold || 5
          }));
        }
      }

      // 2. Fetch live orders
      const orderRes = await fetch('/api/orders');
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        if (orderData.success && Array.isArray(orderData.orders)) {
          this.data.orders = orderData.orders.map(o => ({
            id: o.id,
            timeLabel: o.time_label || new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: o.created_at,
            amount: Number(o.amount) || 0,
            itemCount: Number(o.item_count) || (Array.isArray(o.items) ? o.items.length : 1),
            status: o.status || 'Paid',
            paymentMethod: o.payment_method || 'UPI',
            items: Array.isArray(o.items) ? o.items : []
          }));
        }
      }

      // 3. Fetch community metrics
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

      this.save();
    } catch (err) {
      console.warn('[StoreDB] Sync with server skipped (offline or booting):', err.message);
    }
  }

  resetToDefault() {
    this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    this.save();
  }

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
        console.error('Listener error', err);
      }
    });
  }

  getProducts(category = 'All') {
    if (!category || category === 'All') return this.data.products;
    return this.data.products.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  getProduct(id) {
    return this.data.products.find(p => p.id === id);
  }

  async addProduct(newProduct) {
    const id = newProduct.id || ('prod_' + Date.now());
    const product = {
      id,
      name: newProduct.name,
      variant: newProduct.variant || '',
      category: newProduct.category || 'Chips',
      price: Number(newProduct.price) || 10,
      stock: Number(newProduct.stock) || 0,
      expectedStock: Number(newProduct.stock) || 0,
      physicalStock: Number(newProduct.stock) || 0,
      image: newProduct.image || 'assets/lays.png',
      badge: Number(newProduct.stock) <= 3 ? (Number(newProduct.stock) === 0 ? 'OUT OF STOCK' : 'LOW STOCK') : '',
      lowStockThreshold: 5
    };
    this.data.products.push(product);
    this.save();

    // Persist to server & Supabase
    try {
      await fetch('/api/admin/add-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
      await this.syncWithServer();
    } catch (e) {
      console.warn('Could not persist product to backend:', e);
    }

    return product;
  }

  getCart() {
    return this.data.cart || [];
  }

  addToCart(productId) {
    const product = this.getProduct(productId);
    if (!product || product.stock <= 0) return false;

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
        price: product.price,
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

  // Local record helper called after server confirms payment
  recordConfirmedOrder(serverOrder) {
    if (!serverOrder) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    const formattedOrder = {
      id: serverOrder.id,
      timeLabel: `TODAY, ${timeStr.toUpperCase()}`,
      createdAt: serverOrder.created_at || now.toISOString(),
      amount: Number(serverOrder.amount),
      itemCount: Number(serverOrder.item_count || (serverOrder.items ? serverOrder.items.length : 1)),
      status: 'Paid',
      paymentMethod: serverOrder.payment_method || 'Cashfree UPI',
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

    const exists = this.data.orders.some(o => o.id === formattedOrder.id);
    if (!exists) {
      this.data.orders.unshift(formattedOrder);
    }
    this.data.community.salesToday += formattedOrder.amount;
    this.data.community.completedPayments += 1;
    this.data.cart = [];
    this.save();

    return formattedOrder;
  }

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

    if (prod.stock === 0) {
      prod.badge = 'OUT OF STOCK';
    } else if (prod.stock <= prod.lowStockThreshold) {
      prod.badge = 'LOW STOCK';
    } else {
      prod.badge = '';
    }

    this.save();

    // Persist to server & Supabase
    try {
      await fetch('/api/admin/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          newStockLevel: Number(newStockLevel),
          auditNote,
          auditedBy: 'Admin'
        })
      });
      await this.syncWithServer();
    } catch (e) {
      console.warn('Could not persist stock adjustment to backend:', e);
    }
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
