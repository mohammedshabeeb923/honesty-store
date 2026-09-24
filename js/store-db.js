/**
 * Honesty Store - Reactive Data Layer & State Store
 * Synchronizes state between Customer Mobile App and Business Admin Console
 */

const STORAGE_KEY = 'honesty_store_v1';

const DEFAULT_DATA = {
  products: [
    {
      id: 'lays',
      name: 'Lays',
      variant: 'Classic Potato Chips',
      category: 'Chips',
      price: 20,
      stock: 18,
      expectedStock: 18,
      physicalStock: 15, // -3 difference as seen in Admin screenshot
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
  orders: [
    {
      id: 'HS10452',
      timeLabel: 'TODAY, 10:42 AM',
      createdAt: new Date().toISOString(),
      amount: 50,
      itemCount: 3,
      status: 'Paid',
      items: [
        { id: 'lays', name: 'Lays Classic', qty: 1, price: 20 },
        { id: 'oreo', name: 'Oreo', qty: 1, price: 30 }
      ]
    },
    {
      id: 'HS10431',
      timeLabel: 'YESTERDAY, 2:15 PM',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      amount: 20,
      itemCount: 1,
      status: 'Paid',
      items: [
        { id: 'lays', name: 'Lays Classic', qty: 1, price: 20 }
      ]
    }
  ],
  community: {
    salesToday: 1620,
    storeVisits: 127,
    completedPayments: 81,
    pledgesCount: 342,
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

  addProduct(newProduct) {
    const id = 'prod_' + Date.now();
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

  checkout(paymentMethod = 'UPI') {
    const cart = this.data.cart;
    if (!cart || cart.length === 0) return null;

    const { total, count } = this.getCartTotal();
    const orderNumber = 10450 + this.data.orders.length + 1;
    const orderId = `HS${orderNumber}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const timeLabel = `TODAY, ${timeStr.toUpperCase()}`;

    cart.forEach(item => {
      const prod = this.getProduct(item.id);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.qty);
        prod.expectedStock = prod.stock;
        prod.physicalStock = Math.max(0, prod.physicalStock - item.qty);
        if (prod.stock === 0) {
          prod.badge = 'OUT OF STOCK';
        } else if (prod.stock <= prod.lowStockThreshold) {
          prod.badge = 'LOW STOCK';
        } else {
          prod.badge = '';
        }
      }
    });

    const newOrder = {
      id: orderId,
      timeLabel,
      createdAt: now.toISOString(),
      amount: total,
      itemCount: count,
      status: 'Paid',
      paymentMethod,
      items: JSON.parse(JSON.stringify(cart))
    };

    this.data.orders.unshift(newOrder);
    this.data.community.salesToday += total;
    this.data.community.completedPayments += 1;
    this.data.community.storeVisits += 1;
    this.data.cart = [];
    this.save();

    return newOrder;
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

  adjustStock(productId, newStockLevel, auditNote = '') {
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
  }

  logVisit() {
    this.data.community.storeVisits += 1;
    this.save();
  }

  signHonorPledge() {
    this.data.community.pledgesCount = (this.data.community.pledgesCount || 340) + 1;
    this.save();
  }
}

window.storeDB = new StoreDB();
