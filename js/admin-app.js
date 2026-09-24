/**
 * Business Admin Console Controller
 * Matches Screenshot media_1788895479631.jpg
 */

class AdminApp {
  constructor() {
    this.activeTab = 'inventory';
    this.selectedProductId = 'lays';
    this.searchQuery = '';
    this.initElements();
    this.bindEvents();
    this.subscribeToStore();
    this.render();
  }

  initElements() {
    this.sidebarItems = document.querySelectorAll('.sidebar-nav-item');
    this.tabViews = {
      inventory: document.getElementById('admin-tab-inventory'),
      dashboard: document.getElementById('admin-tab-dashboard'),
      sales: document.getElementById('admin-tab-sales'),
      users: document.getElementById('admin-tab-users'),
      settings: document.getElementById('admin-tab-settings')
    };
    this.pageHeading = document.getElementById('admin-page-heading');
    this.searchInput = document.getElementById('admin-search-input');
    this.stockListContainer = document.getElementById('admin-stock-items-list');
    this.detailPanel = document.getElementById('admin-detail-panel');
  }

  bindEvents() {
    // Sidebar navigation
    this.sidebarItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (!tab) return;
        this.switchTab(tab);
      });
    });

    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderStockList();
      });
    }

    // Adjust Stock Button in Detail Panel
    const btnAdjustStock = document.getElementById('btn-open-adjust-stock');
    if (btnAdjustStock) {
      btnAdjustStock.addEventListener('click', () => {
        this.openAdjustStockModal();
      });
    }

    // Add Product Button
    const btnAddProduct = document.getElementById('btn-open-add-product');
    if (btnAddProduct) {
      btnAddProduct.addEventListener('click', () => {
        const modal = document.getElementById('add-product-modal');
        if (modal) modal.classList.add('active');
      });
    }

    // Save Adjusted Stock Modal Form
    const adjustForm = document.getElementById('adjust-stock-form');
    if (adjustForm) {
      adjustForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newStock = document.getElementById('adjust-stock-input').value;
        const note = document.getElementById('adjust-stock-note').value;
        window.storeDB.adjustStock(this.selectedProductId, newStock, note);
        document.getElementById('adjust-stock-modal').classList.remove('active');
      });
    }

    // Save Add Product Form
    const addProductForm = document.getElementById('add-product-form');
    if (addProductForm) {
      addProductForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('new-prod-name').value;
        const variant = document.getElementById('new-prod-variant').value;
        const category = document.getElementById('new-prod-category').value;
        const price = document.getElementById('new-prod-price').value;
        const stock = document.getElementById('new-prod-stock').value;

        window.storeDB.addProduct({
          name,
          variant,
          category,
          price,
          stock,
          image: 'assets/lays.png'
        });

        document.getElementById('add-product-modal').classList.remove('active');
        addProductForm.reset();
      });
    }
  }

  subscribeToStore() {
    window.storeDB.subscribe(() => {
      this.render();
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    this.sidebarItems.forEach(i => {
      if (i.dataset.tab === tabName) {
        i.classList.add('active');
      } else {
        i.classList.remove('active');
      }
    });

    Object.keys(this.tabViews).forEach(k => {
      if (this.tabViews[k]) {
        this.tabViews[k].classList.remove('active');
      }
    });

    if (this.tabViews[tabName]) {
      this.tabViews[tabName].classList.add('active');
    }

    if (this.pageHeading) {
      this.pageHeading.innerText = tabName.toUpperCase();
    }

    this.render();
  }

  render() {
    if (this.activeTab === 'inventory') {
      this.renderStockList();
      this.renderDetailPanel();
    } else if (this.activeTab === 'dashboard') {
      this.renderDashboard();
    } else if (this.activeTab === 'sales') {
      this.renderSales();
    } else if (this.activeTab === 'users') {
      this.renderUsers();
    }
  }

  renderStockList() {
    if (!this.stockListContainer) return;

    let products = window.storeDB.data.products;
    if (this.searchQuery) {
      products = products.filter(p =>
        p.name.toLowerCase().includes(this.searchQuery) ||
        p.variant.toLowerCase().includes(this.searchQuery) ||
        p.category.toLowerCase().includes(this.searchQuery)
      );
    }

    this.stockListContainer.innerHTML = products.map(prod => {
      const isSelected = prod.id === this.selectedProductId;
      let pillClass = 'in-stock';
      let statusText = 'In Stock';

      if (prod.stock === 0) {
        pillClass = 'out-of-stock';
        statusText = 'Restock';
      } else if (prod.stock <= (prod.lowStockThreshold || 5)) {
        pillClass = 'low-stock';
        statusText = 'Restock';
      }

      return `
        <div class="stock-item-row ${isSelected ? 'selected' : ''}" onclick="window.adminApp.selectProduct('${prod.id}')">
          <div class="stock-item-left">
            <div class="stock-thumb-wrap">
              <img src="${prod.image}" alt="${prod.name}" />
            </div>
            <div class="stock-item-info">
              <h4>${prod.name}</h4>
              <p>${prod.variant}</p>
            </div>
          </div>
          <div class="stock-item-right">
            <div class="unit-count-pill ${pillClass}">
              <span class="pill-dot"></span>
              ${prod.stock} Units
            </div>
            <div class="stock-status-text">${statusText}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  selectProduct(productId) {
    this.selectedProductId = productId;
    window.storeDB.setSelectedAuditProduct(productId);
    this.renderStockList();
    this.renderDetailPanel();
  }

  renderDetailPanel() {
    const prod = window.storeDB.getProduct(this.selectedProductId) || window.storeDB.data.products[0];
    if (!prod || !this.detailPanel) return;

    const expected = prod.expectedStock !== undefined ? prod.expectedStock : prod.stock;
    const physical = prod.physicalStock !== undefined ? prod.physicalStock : prod.stock;
    const diff = physical - expected;

    const diffDisplay = diff > 0 ? `+${diff}` : `${diff}`;
    const diffColorClass = diff < 0 ? 'diff-negative' : (diff === 0 ? 'diff-balanced' : 'diff-positive');

    this.detailPanel.innerHTML = `
      <div class="detail-panel-header">
        <div class="detail-panel-titles">
          <h3>Detail View</h3>
          <p>${prod.name} ${prod.variant}</p>
        </div>
        <div class="detail-header-thumb">
          <img src="${prod.image}" alt="${prod.name}" />
        </div>
      </div>

      <div class="stock-metrics-grid">
        <div class="stock-metric-card">
          <div class="metric-card-label">Expected Stock</div>
          <div class="metric-card-number">${expected}</div>
        </div>
        <div class="stock-metric-card">
          <div class="metric-card-label">Physical Stock</div>
          <div class="metric-card-number" style="display:flex; align-items:center; justify-content:space-between;">
            <span>${physical}</span>
            <button onclick="window.adminApp.promptPhysicalStock('${prod.id}', ${physical})" 
                    style="border:none; background:#e2e8f0; border-radius:6px; font-size:11px; padding:2px 6px; cursor:pointer;" title="Quick count update">✏️</button>
          </div>
        </div>
      </div>

      <div class="stock-difference-card" style="border-left-color: ${diff < 0 ? '#ef4444' : (diff === 0 ? '#10b981' : '#3b82f6')}">
        <div class="difference-label">Difference</div>
        <div class="difference-val" style="color: ${diff < 0 ? '#dc2626' : (diff === 0 ? '#059669' : '#2563eb')}">${diffDisplay}</div>
      </div>

      <div class="trust-callout-box">
        <div class="trust-callout-icon">ⓘ</div>
        <div class="trust-callout-text">
          Inventory differences help us identify where the system needs attention. They do not automatically indicate wrongdoing.
        </div>
      </div>

      <button class="btn-adjust-stock" id="btn-open-adjust-stock" onclick="window.adminApp.openAdjustStockModal()">
        Adjust Stock
      </button>
    `;
  }

  promptPhysicalStock(productId, currentVal) {
    const val = prompt('Enter actual counted units on shelf for physical reconciliation:', currentVal);
    if (val !== null && !isNaN(val)) {
      window.storeDB.updatePhysicalStock(productId, Number(val));
    }
  }

  openAdjustStockModal() {
    const prod = window.storeDB.getProduct(this.selectedProductId);
    if (!prod) return;

    const modal = document.getElementById('adjust-stock-modal');
    document.getElementById('adjust-modal-prod-name').innerText = `${prod.name} (${prod.variant})`;
    document.getElementById('adjust-stock-input').value = prod.stock;
    if (modal) modal.classList.add('active');
  }

  renderDashboard() {
    const dashboardSubView = this.dashboardSubView || 'today';
    const container = document.getElementById('dashboard-dynamic-content');
    if (!container) return;

    if (dashboardSubView === 'today') {
      // Matches Screenshot media_1788895850088.jpg
      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 28px; font-weight: 800; color: #000; margin-bottom: 4px;">Today's Overview</h2>
          <p style="font-size: 14px; color: #64748b;">Real-time metrics for current operations.</p>
        </div>

        <!-- 4 Top KPI Cards -->
        <div class="dashboard-kpi-grid">
          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">TODAY'S SALES</span>
              <div class="kpi-icon-pill">₹</div>
            </div>
            <div class="kpi-val">₹2,480</div>
            <div class="kpi-sub positive">
              <span>↗ +12% vs yesterday</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">ORDERS</span>
              <div class="kpi-icon-pill">🧾</div>
            </div>
            <div class="kpi-val">94</div>
            <div class="kpi-sub">Across 3 locations</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">ITEMS SOLD</span>
              <div class="kpi-icon-pill">🛍️</div>
            </div>
            <div class="kpi-val">127</div>
            <div class="kpi-sub">Top item: Cold Coffee</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">SUCCESSFUL PAYMENTS</span>
              <div class="kpi-icon-pill">🛡️</div>
            </div>
            <div class="kpi-val">91</div>
            <div class="kpi-sub">96.8% completion rate</div>
          </div>
        </div>

        <!-- CONVERSION FUNNEL (Exact match to screenshot 3) -->
        <div class="conversion-funnel-card">
          <div class="funnel-card-header">
            <h3>Conversion Funnel</h3>
            <a href="#" class="funnel-link" onclick="alert('Funnel telemetry: QR Scan to payment conversion is 71.6% across nodes.')">View Details →</a>
          </div>

          <div class="funnel-stages-row">
            <!-- Stage 1 -->
            <div class="funnel-stage-item">
              <div class="funnel-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </div>
              <div class="funnel-count-val">127</div>
              <div class="funnel-stage-label">QR SCANS</div>
            </div>

            <!-- Stage 2 -->
            <div class="funnel-stage-item">
              <div class="funnel-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                </svg>
              </div>
              <div class="funnel-count-val">110</div>
              <div class="funnel-stage-label">STORE VISITS</div>
              <span class="funnel-drop-badge">-13% drop</span>
            </div>

            <!-- Stage 3 -->
            <div class="funnel-stage-item">
              <div class="funnel-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
              </div>
              <div class="funnel-count-val">94</div>
              <div class="funnel-stage-label">CHECKOUT STARTED</div>
              <span class="funnel-drop-badge">-14% drop</span>
            </div>

            <!-- Stage 4 -->
            <div class="funnel-stage-item">
              <div class="funnel-circle completed">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5">
                  <circle cx="12" cy="12" r="9"></circle>
                  <polyline points="9 12 11 14 15 10"></polyline>
                </svg>
              </div>
              <div class="funnel-count-val">91</div>
              <div class="funnel-stage-label">PAYMENT COMPLETED</div>
              <span class="funnel-drop-badge">-3% drop</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Matches Screenshot media_1788895850087.jpg (30 Days + System States)
      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 28px; font-weight: 800; color: #000; margin-bottom: 4px;">Overview</h2>
          <p style="font-size: 14px; color: #64748b;">Performance for the last 30 days.</p>
        </div>

        <!-- 4 Stat Cards -->
        <div class="dashboard-kpi-grid">
          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">💳</span>
              <span class="kpi-badge-pill">+12%</span>
            </div>
            <span class="kpi-title">Revenue</span>
            <div class="kpi-val">₹1,620</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">📈</span>
              <span class="kpi-badge-pill">+4.2%</span>
            </div>
            <span class="kpi-title">Conversion</span>
            <div class="kpi-val">63.8%</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">📲</span>
            </div>
            <span class="kpi-title">QR Scans</span>
            <div class="kpi-val">127</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">👥</span>
            </div>
            <span class="kpi-title">Unique Visitors</span>
            <div class="kpi-val">93</div>
          </div>
        </div>

        <!-- Middle Grid: Top Products & Daily Sales Chart -->
        <div class="dashboard-middle-grid">
          <!-- Top Products -->
          <div class="top-products-card">
            <h3 style="font-size: 16px; font-weight: 800; color: #0f172a;">Top Products</h3>
            <div class="top-products-list">
              <div class="top-product-item">
                <div class="top-prod-rank-name">
                  <span class="top-prod-rank">1</span>
                  <span class="top-prod-name">Lays Classic</span>
                </div>
                <span class="top-prod-sales">42 sold</span>
              </div>
              <div class="top-product-item">
                <div class="top-prod-rank-name">
                  <span class="top-prod-rank">2</span>
                  <span class="top-prod-name">Oreo Original</span>
                </div>
                <span class="top-prod-sales">38 sold</span>
              </div>
              <div class="top-product-item">
                <div class="top-prod-rank-name">
                  <span class="top-prod-rank">3</span>
                  <span class="top-prod-name">Dairy Milk Silk</span>
                </div>
                <span class="top-prod-sales">29 sold</span>
              </div>
            </div>
            <button onclick="window.adminApp.switchTab('inventory')" 
                    style="width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:10px; font-size:13px; font-weight:700; cursor:pointer;">
              View Full List
            </button>
          </div>

          <!-- Daily Sales Wave Chart -->
          <div class="chart-card">
            <div class="chart-card-header">
              <h3>Daily Sales</h3>
              <span style="color:#94a3b8; font-weight:800; font-size:18px;">···</span>
            </div>
            <div style="height: 180px; position: relative;">
              <svg viewBox="0 0 400 160" width="100%" height="100%" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
                  </linearGradient>
                </defs>
                <path d="M 0,90 Q 60,115 110,65 T 200,95 T 300,10 T 400,90 L 400,160 L 0,160 Z" fill="url(#waveGrad)" />
                <path d="M 0,90 Q 60,115 110,65 T 200,95 T 300,10 T 400,90" fill="none" stroke="#64748b" stroke-width="3" />
                <circle cx="110" cy="65" r="4" fill="#0f172a" />
                <circle cx="170" cy="80" r="4" fill="#0f172a" />
                <circle cx="250" cy="35" r="4" fill="#0f172a" />
                <circle cx="340" cy="70" r="4" fill="#0f172a" />
              </svg>
            </div>
          </div>
        </div>

        <!-- SYSTEM STATES SECTION (Matches media_1788895850087.jpg) -->
        <div class="system-states-section">
          <div class="system-states-header">
            <h3>System States</h3>
            <p>Elegant feedback for common scenarios.</p>
          </div>

          <div class="system-states-grid">
            <!-- State 1: Cart Waiting -->
            <div class="state-preview-card">
              <div class="state-icon-circle">🛍️</div>
              <div class="state-title">Your cart is waiting</div>
              <p class="state-desc">Discover fresh snacks and beverages in the store.</p>
              <button class="state-btn-action" onclick="window.customerApp.switchScreen('screen-catalog')">
                Start Shopping
              </button>
            </div>

            <!-- State 2: No Orders Yet -->
            <div class="state-preview-card">
              <div class="state-icon-circle">🧾</div>
              <div class="state-title">No orders yet</div>
              <p class="state-desc">Your history will appear here once you make your first purchase.</p>
            </div>

            <!-- State 3: Everything in Sync -->
            <div class="state-preview-card">
              <div class="state-icon-circle mint">✓</div>
              <div class="state-title">Everything is in sync</div>
              <p class="state-desc">No inventory discrepancies found across all locations.</p>
            </div>
          </div>
        </div>
      `;
    }
  }

  setDashboardSubView(view) {
    this.dashboardSubView = view;
    document.querySelectorAll('.dashboard-toggle-btn').forEach(btn => {
      if (btn.dataset.subview === view) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.renderDashboard();
  }

  renderSales() {
    const salesTableBody = document.getElementById('sales-table-body');
    if (!salesTableBody) return;

    const orders = window.storeDB.data.orders;
    salesTableBody.innerHTML = orders.map(order => `
      <tr>
        <td><strong>${order.id}</strong></td>
        <td>${order.timeLabel}</td>
        <td>${order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}</td>
        <td><strong>₹${order.amount}</strong></td>
        <td><span class="badge-paid">✓ ${order.status}</span></td>
        <td>${order.paymentMethod || 'UPI'}</td>
      </tr>
    `).join('');
  }

  renderUsers() {
    const usersBody = document.getElementById('users-activity-body');
    if (!usersBody) return;

    usersBody.innerHTML = `
      <tr>
        <td>#VIS-1088</td>
        <td>Just now</td>
        <td>Shelf Checkout (Completed)</td>
        <td><span class="badge-paid">Verified</span></td>
        <td>₹50</td>
      </tr>
      <tr>
        <td>#VIS-1087</td>
        <td>15 mins ago</td>
        <td>Store Entry & QR Scan</td>
        <td><span style="color:#64748b;">Browsed</span></td>
        <td>-</td>
      </tr>
      <tr>
        <td>#VIS-1086</td>
        <td>32 mins ago</td>
        <td>Shelf Checkout (Completed)</td>
        <td><span class="badge-paid">Verified</span></td>
        <td>₹20</td>
      </tr>
    `;
  }
}

window.AdminApp = AdminApp;
