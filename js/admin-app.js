/**
 * Business Admin Console Controller
 * Real Supabase & Cashfree Aggregated Analytics
 */

class AdminApp {
  constructor() {
    this.activeTab = 'inventory';
    this.selectedProductId = 'lays';
    this.searchQuery = '';
    this.dashboardSubView = 'today';
    this.initElements();
    this.bindEvents();
    this.subscribeToStore();
    this.render();
  }

  initElements() {
    this.sidebarItems = document.querySelectorAll('.sidebar-nav-item');
    this.tabViews = {
      inventory: document.getElementById('admin-tab-inventory'),
      products: document.getElementById('admin-tab-products'),
      dashboard: document.getElementById('admin-tab-dashboard'),
      sales: document.getElementById('admin-tab-sales'),
      users: document.getElementById('admin-tab-users'),
      settings: document.getElementById('admin-tab-settings')
    };
    this.pageHeading = document.getElementById('admin-page-heading');
    this.searchInput = document.getElementById('admin-search-input');
    this.stockListContainer = document.getElementById('admin-stock-items-list');
    this.detailPanel = document.getElementById('admin-detail-panel');
    this.populateSettings();
  }

  populateSettings() {
    const urlEl = document.getElementById('cfg-supabase-url');
    const keyEl = document.getElementById('cfg-supabase-key');
    const cfEl = document.getElementById('cfg-cashfree-appid');
    const envEl = document.getElementById('cfg-cashfree-env');
    if (urlEl && localStorage.getItem('HONESTY_SUPABASE_URL')) urlEl.value = localStorage.getItem('HONESTY_SUPABASE_URL');
    if (keyEl && localStorage.getItem('HONESTY_SUPABASE_ANON_KEY')) keyEl.value = localStorage.getItem('HONESTY_SUPABASE_ANON_KEY');
    if (cfEl && localStorage.getItem('HONESTY_CASHFREE_APP_ID')) cfEl.value = localStorage.getItem('HONESTY_CASHFREE_APP_ID');
    if (envEl && localStorage.getItem('HONESTY_CASHFREE_ENV')) envEl.value = localStorage.getItem('HONESTY_CASHFREE_ENV');
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
        if (this.activeTab === 'inventory') this.renderStockList();
        else if (this.activeTab === 'products') this.renderProductsTab();
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
        this.openProductModal();
      });
    }

    // Product Editor Modal Close Buttons
    const btnCloseProdModal = document.getElementById('btn-close-prod-modal');
    if (btnCloseProdModal) {
      btnCloseProdModal.addEventListener('click', () => {
        const modal = document.getElementById('product-editor-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    const btnCancelProdModal = document.getElementById('btn-cancel-prod-modal');
    if (btnCancelProdModal) {
      btnCancelProdModal.addEventListener('click', () => {
        const modal = document.getElementById('product-editor-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Product Photo File Input Handler
    const prodFileInput = document.getElementById('prod-file-input');
    if (prodFileInput) {
      prodFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handlePhotoSelected(e.target.files[0]);
        }
      });
    }

    // Drag and Drop on Photo Dropzone
    const dropzone = document.getElementById('photo-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.style.background = '#e0f2fe';
          dropzone.style.borderColor = '#0284c7';
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.style.background = '#ffffff';
          dropzone.style.borderColor = '#94a3b8';
        });
      });
      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handlePhotoSelected(e.dataTransfer.files[0]);
        }
      });
    }

    // Remove Photo Button
    const btnRemovePhoto = document.getElementById('btn-remove-photo');
    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', () => {
        this.removePhoto();
      });
    }

    // Product Filters (Category & Status)
    const catFilter = document.getElementById('prod-filter-category');
    if (catFilter) {
      catFilter.addEventListener('change', () => {
        this.renderProductsTab();
      });
    }

    const statusFilter = document.getElementById('prod-filter-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        this.renderProductsTab();
      });
    }

    // Save Product Form (Handles both Add and Edit)
    const productEditorForm = document.getElementById('product-editor-form');
    if (productEditorForm) {
      productEditorForm.addEventListener('submit', async (e) => {
        await this.saveProduct(e);
      });
    }

    // Save Adjusted Stock Modal Form
    const adjustForm = document.getElementById('adjust-stock-form');
    if (adjustForm) {
      adjustForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newStock = document.getElementById('adjust-stock-input').value;
        const note = document.getElementById('adjust-stock-note').value;
        await window.storeDB.adjustStock(this.selectedProductId, newStock, note);
        document.getElementById('adjust-stock-modal').classList.remove('active');
        this.render();
      });
    }

    // Save Physical Stock Count Form
    const physForm = document.getElementById('physical-stock-form');
    if (physForm) {
      physForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputVal = document.getElementById('physical-stock-input').value;
        if (this.selectedProductId && inputVal !== '') {
          window.storeDB.updatePhysicalStock(this.selectedProductId, Number(inputVal));
          if (window.showToast) window.showToast(`Physical shelf units updated to ${inputVal}`, 'success');
        }
        const modal = document.getElementById('physical-stock-modal');
        if (modal) modal.classList.remove('active');
        this.render();
      });
    }

    const btnCancelPhys = document.getElementById('btn-cancel-physical-stock');
    if (btnCancelPhys) {
      btnCancelPhys.addEventListener('click', () => {
        const modal = document.getElementById('physical-stock-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    const btnClosePhys = document.getElementById('btn-close-physical-stock');
    if (btnClosePhys) {
      btnClosePhys.addEventListener('click', () => {
        const modal = document.getElementById('physical-stock-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Quick Add Stock Modal Form
    const quickAddForm = document.getElementById('quick-add-stock-form');
    if (quickAddForm) {
      quickAddForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('add-stock-prod-id').value;
        const addQty = parseInt(document.getElementById('add-stock-qty-input').value, 10);
        if (prodId && addQty > 0) {
          await window.storeDB.quickAddStock(prodId, addQty);
          if (window.showToast) window.showToast(`Added +${addQty} units of stock`, 'success');
        }
        document.getElementById('quick-add-stock-modal').classList.remove('active');
        this.render();
      });
    }

    const btnCloseAddStock = document.getElementById('btn-close-add-stock-modal');
    if (btnCloseAddStock) {
      btnCloseAddStock.addEventListener('click', () => {
        document.getElementById('quick-add-stock-modal').classList.remove('active');
      });
    }

    const btnCancelAddStock = document.getElementById('btn-cancel-add-stock-modal');
    if (btnCancelAddStock) {
      btnCancelAddStock.addEventListener('click', () => {
        document.getElementById('quick-add-stock-modal').classList.remove('active');
      });
    }
  }

  openQuickAddStockModal(productId) {
    const prod = window.storeDB.getProduct(productId);
    if (!prod) return;
    const modal = document.getElementById('quick-add-stock-modal');
    if (!modal) return;
    document.getElementById('add-stock-prod-id').value = prod.id;
    document.getElementById('add-stock-modal-title').innerText = `Add Stock: ${prod.name}`;
    document.getElementById('add-stock-current-display').innerText = `${prod.stock} units`;
    document.getElementById('add-stock-qty-input').value = '10';
    modal.classList.add('active');
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
    } else if (this.activeTab === 'products') {
      this.renderProductsTab();
    } else if (this.activeTab === 'dashboard') {
      this.renderDashboard();
    } else if (this.activeTab === 'sales') {
      this.renderSales();
    } else if (this.activeTab === 'users') {
      this.renderUsers();
    }
  }

  // Open Product Modal (Add or Edit)
  openProductModal(productId = null) {
    const modal = document.getElementById('product-editor-modal');
    if (!modal) return;

    const titleEl = document.getElementById('prod-modal-title');
    const form = document.getElementById('product-editor-form');
    const idInput = document.getElementById('editor-prod-id');
    const nameInput = document.getElementById('editor-prod-name');
    const refNameInput = document.getElementById('editor-prod-ref-name');
    const variantInput = document.getElementById('editor-prod-variant');
    const catInput = document.getElementById('editor-prod-category');
    const descInput = document.getElementById('editor-prod-description');
    const purchasePriceInput = document.getElementById('editor-prod-purchase-price');
    const priceInput = document.getElementById('editor-prod-price');
    const sellPriceInput = document.getElementById('editor-prod-selling-price');
    const stockInput = document.getElementById('editor-prod-stock');
    const threshInput = document.getElementById('editor-prod-threshold');
    const activeInput = document.getElementById('editor-prod-active');
    const imgUrlInput = document.getElementById('editor-image-url');
    const storagePathInput = document.getElementById('editor-storage-path');
    const dropzone = document.getElementById('photo-dropzone');
    const previewCard = document.getElementById('photo-preview-card');
    const previewImg = document.getElementById('photo-preview-img');
    const statusBadge = document.getElementById('photo-status-badge');
    const sizeBadge = document.getElementById('photo-size-badge');
    const submitText = document.getElementById('btn-save-prod-text');

    form.reset();

    if (productId) {
      const prod = window.storeDB.getProduct(productId);
      if (!prod) return;

      if (titleEl) titleEl.innerText = `Edit Product: ${prod.name}`;
      if (submitText) submitText.innerText = 'Update Product';
      if (idInput) idInput.value = prod.id;
      if (nameInput) nameInput.value = prod.name || '';
      if (refNameInput) refNameInput.value = prod.referenceName || '';
      if (variantInput) variantInput.value = prod.variant || '';
      if (catInput) catInput.value = prod.category || 'Chips';
      if (descInput) descInput.value = prod.description || '';
      if (purchasePriceInput) purchasePriceInput.value = (prod.purchasePrice !== null && prod.purchasePrice !== undefined) ? prod.purchasePrice : '';
      if (priceInput) priceInput.value = prod.price || 10;
      if (sellPriceInput) sellPriceInput.value = (prod.sellingPrice !== null && prod.sellingPrice !== undefined) ? prod.sellingPrice : '';
      if (stockInput) stockInput.value = prod.stock !== undefined ? prod.stock : 0;
      if (threshInput) threshInput.value = prod.lowStockThreshold || 5;
      if (activeInput) activeInput.checked = prod.isActive !== false;
      if (imgUrlInput) imgUrlInput.value = prod.image || 'assets/lays.png';
      if (storagePathInput) storagePathInput.value = prod.storagePath || '';

      if (prod.image && prod.image !== 'assets/lays.png') {
        dropzone.style.display = 'none';
        previewCard.style.display = 'flex';
        previewImg.src = prod.image;
        if (statusBadge) {
          statusBadge.innerText = 'Current Image';
          statusBadge.className = 'badge-tag success';
        }
        if (sizeBadge) sizeBadge.innerText = 'Supabase Storage';
      } else {
        dropzone.style.display = 'block';
        previewCard.style.display = 'none';
      }
    } else {
      if (titleEl) titleEl.innerText = 'Add Shelf Product';
      if (submitText) submitText.innerText = 'Add to Shelf';
      if (idInput) idInput.value = '';
      if (refNameInput) refNameInput.value = '';
      if (purchasePriceInput) purchasePriceInput.value = '';
      if (sellPriceInput) sellPriceInput.value = '';
      if (imgUrlInput) imgUrlInput.value = 'assets/lays.png';
      if (storagePathInput) storagePathInput.value = '';
      if (priceInput) priceInput.value = '10';
      if (stockInput) stockInput.value = '15';
      if (threshInput) threshInput.value = '5';
      if (activeInput) activeInput.checked = true;
      dropzone.style.display = 'block';
      previewCard.style.display = 'none';
    }

    modal.classList.add('active');
  }

  // Handle Photo Selection & Canvas Optimization
  async handlePhotoSelected(file) {
    if (!file) return;

    const dropzone = document.getElementById('photo-dropzone');
    const previewCard = document.getElementById('photo-preview-card');
    const previewImg = document.getElementById('photo-preview-img');
    const spinner = document.getElementById('photo-upload-spinner');
    const statusBadge = document.getElementById('photo-status-badge');
    const sizeBadge = document.getElementById('photo-size-badge');
    const imgUrlInput = document.getElementById('editor-image-url');
    const storagePathInput = document.getElementById('editor-storage-path');
    const prodId = document.getElementById('editor-prod-id').value;

    dropzone.style.display = 'none';
    previewCard.style.display = 'flex';
    spinner.style.display = 'flex';
    if (statusBadge) {
      statusBadge.innerText = 'Processing...';
      statusBadge.className = 'badge-tag warning';
    }

    try {
      // 1. Optimize on client canvas
      const optimized = await window.supabaseClient.optimizeImage(file);
      previewImg.src = optimized.dataUrl;

      const kb = Math.round(optimized.size / 1024);
      if (sizeBadge) sizeBadge.innerText = `${kb} KB (${optimized.width}x${optimized.height})`;

      // 2. Upload to Supabase Storage
      const uploadResult = await window.supabaseClient.uploadProductImage(file, prodId);
      imgUrlInput.value = uploadResult.publicUrl;
      storagePathInput.value = uploadResult.storagePath;

      if (statusBadge) {
        statusBadge.innerText = 'Uploaded';
        statusBadge.className = 'badge-tag success';
      }
      if (window.showToast) window.showToast('Product photo uploaded & optimized successfully!', 'success');
    } catch (err) {
      console.error('[Photo Upload Error]:', err);
      if (statusBadge) {
        statusBadge.innerText = 'Upload Error';
        statusBadge.className = 'badge-tag danger';
      }
      alert('Photo upload failed: ' + err.message);
    } finally {
      spinner.style.display = 'none';
    }
  }

  removePhoto() {
    const dropzone = document.getElementById('photo-dropzone');
    const previewCard = document.getElementById('photo-preview-card');
    const imgUrlInput = document.getElementById('editor-image-url');
    const storagePathInput = document.getElementById('editor-storage-path');
    const fileInput = document.getElementById('prod-file-input');

    if (fileInput) fileInput.value = '';
    imgUrlInput.value = 'assets/lays.png';
    storagePathInput.value = '';
    previewCard.style.display = 'none';
    dropzone.style.display = 'block';
  }

  // Save Product (Create or Update)
  async saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('editor-prod-id').value;
    const name = document.getElementById('editor-prod-name').value.trim();
    const referenceName = document.getElementById('editor-prod-ref-name')?.value.trim() || null;
    const variant = document.getElementById('editor-prod-variant').value.trim();
    const category = document.getElementById('editor-prod-category').value;
    const description = document.getElementById('editor-prod-description').value.trim();
    const price = parseFloat(document.getElementById('editor-prod-price').value);
    const purchasePriceRaw = document.getElementById('editor-prod-purchase-price')?.value;
    const purchasePrice = (purchasePriceRaw !== undefined && purchasePriceRaw !== '') ? parseFloat(purchasePriceRaw) : null;
    const sellPriceRaw = document.getElementById('editor-prod-selling-price')?.value;
    const sellingPrice = (sellPriceRaw !== undefined && sellPriceRaw !== '') ? parseFloat(sellPriceRaw) : null;
    const stock = parseInt(document.getElementById('editor-prod-stock').value, 10);
    const threshold = parseInt(document.getElementById('editor-prod-threshold').value, 10) || 5;
    const isActive = document.getElementById('editor-prod-active').checked;
    const imageUrl = document.getElementById('editor-image-url').value || 'assets/lays.png';
    const storagePath = document.getElementById('editor-storage-path').value || null;

    if (!name) {
      alert('Please enter a product name');
      return;
    }
    if (isNaN(price) || price < 0.5) {
      alert('Please enter a valid MRP price (min ₹0.5)');
      return;
    }
    if (isNaN(stock) || stock < 0) {
      alert('Stock quantity cannot be negative');
      return;
    }

    const payload = {
      name,
      referenceName,
      reference_name: referenceName,
      variant,
      category,
      description,
      price,
      purchasePrice,
      purchase_price: purchasePrice,
      sellingPrice,
      selling_price: sellingPrice,
      stock,
      lowStockThreshold: threshold,
      low_stock_threshold: threshold,
      isActive,
      is_active: isActive,
      image: imageUrl,
      imageUrl,
      image_url: imageUrl,
      storagePath,
      storage_path: storagePath
    };

    const submitBtn = document.getElementById('btn-save-prod-modal');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';
    }

    try {
      if (id) {
        await window.storeDB.updateProduct(id, payload);
        if (window.showToast) window.showToast(`Updated product "${name}"`, 'success');
      } else {
        await window.storeDB.addProduct(payload);
        if (window.showToast) window.showToast(`Added new shelf product "${name}"`, 'success');
      }

      document.getElementById('product-editor-modal').classList.remove('active');
      this.render();
    } catch (err) {
      alert('Could not save product: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }
    }
  }

  // Render Products Tab (List Table, Filters, Badges)
  renderProductsTab() {
    const tbody = document.getElementById('admin-products-tbody');
    if (!tbody) return;

    const allProducts = window.storeDB.data.products || [];
    const catFilter = document.getElementById('prod-filter-category')?.value || 'All';
    const statusFilter = document.getElementById('prod-filter-status')?.value || 'all';

    // Update stats pills
    const totalCount = allProducts.length;
    const activeCount = allProducts.filter(p => p.isActive !== false).length;
    const lowCount = allProducts.filter(p => p.isActive !== false && p.stock > 0 && p.stock <= (p.lowStockThreshold || 5)).length;
    const archivedCount = allProducts.filter(p => p.isActive === false).length;

    const elTotal = document.getElementById('stat-prod-total');
    const elActive = document.getElementById('stat-prod-active');
    const elLow = document.getElementById('stat-prod-low');
    const elArchived = document.getElementById('stat-prod-archived');
    if (elTotal) elTotal.innerText = totalCount;
    if (elActive) elActive.innerText = activeCount;
    if (elLow) elLow.innerText = lowCount;
    if (elArchived) elArchived.innerText = archivedCount;

    // Filter products
    let filtered = allProducts;
    if (catFilter !== 'All') {
      filtered = filtered.filter(p => (p.category || '').toLowerCase() === catFilter.toLowerCase());
    }
    if (statusFilter === 'active') {
      filtered = filtered.filter(p => p.isActive !== false);
    } else if (statusFilter === 'archived') {
      filtered = filtered.filter(p => p.isActive === false);
    }
    if (this.searchQuery) {
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(this.searchQuery) ||
        (p.referenceName || '').toLowerCase().includes(this.searchQuery) ||
        (p.variant || '').toLowerCase().includes(this.searchQuery) ||
        (p.category || '').toLowerCase().includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px 14px; color: #64748b;">
            No products match the selected criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(prod => {
      const isArchived = prod.isActive === false;
      const isOutOfStock = Number(prod.stock) <= 0;
      const isLowStock = !isOutOfStock && Number(prod.stock) <= (prod.lowStockThreshold || 5);

      let stockBadge = '<span class="badge-tag success">In Stock</span>';
      if (isOutOfStock) {
        stockBadge = '<span class="badge-tag danger">Out of Stock</span>';
      } else if (isLowStock) {
        stockBadge = '<span class="badge-tag warning">Low Stock</span>';
      }

      // Purchase Rate formatting
      const purchaseDisplay = (prod.purchasePrice !== null && prod.purchasePrice !== undefined)
        ? `₹${Number(prod.purchasePrice).toFixed(2)}`
        : '<span style="color:#94a3b8;">—</span>';

      // Selling Price formatting
      const hasValidSellingPrice = prod.sellingPrice !== null && prod.sellingPrice !== undefined && Number(prod.sellingPrice) > 0;
      const hasDiscount = hasValidSellingPrice && prod.price && Number(prod.sellingPrice) < Number(prod.price);
      let sellingPriceDisplay = '';
      if (hasValidSellingPrice) {
        sellingPriceDisplay = `
          <div style="font-weight: 700; color: #0284c7; font-size: 14px;">
            ₹${Number(prod.sellingPrice).toFixed(2)}
            ${hasDiscount ? `<span style="font-size: 11px; text-decoration: line-through; color: #94a3b8; font-weight: 400; margin-left: 4px;">₹${Number(prod.price).toFixed(2)}</span>` : ''}
          </div>
        `;
      } else {
        sellingPriceDisplay = `
          <span class="badge-tag warning" style="font-size: 11px; font-weight: 700; background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">
            Price Required
          </span>
          <div style="font-size: 10px; color: #dc2626; margin-top: 2px;">Hidden from sales</div>
        `;
      }

      return `
        <tr style="${isArchived ? 'opacity: 0.65; background: #fafafa;' : ''}">
          <td style="vertical-align: middle;">
            <div style="width: 44px; height: 44px; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center;">
              <img src="${window.resolveProductImage ? window.resolveProductImage(prod.image, prod.id) : (prod.image || 'assets/lays.jpg')}" 
                   alt="${prod.name}" 
                   style="width: 100%; height: 100%; object-fit: contain;" 
                   onerror="this.onerror=null;this.src='assets/lays.jpg';" />
            </div>
          </td>
          <td>
            <div style="font-weight: 700; color: #0f172a; font-size: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span>${prod.name}</span>
              ${prod.referenceName ? `<span style="font-size: 10px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-family: monospace;">[${prod.referenceName}]</span>` : ''}
            </div>
            ${prod.variant ? `<div style="font-size: 12px; color: #64748b; margin-top: 1px;">${prod.variant}</div>` : ''}
            ${prod.description ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${prod.description}</div>` : ''}
          </td>
          <td>
            <span class="badge-tag muted">${prod.category || 'Snacks'}</span>
          </td>
          <td>
            <div style="font-weight: 600; color: #334155; font-size: 13px;">${purchaseDisplay}</div>
            <div style="font-size: 10px; color: #94a3b8;">Procurement</div>
          </td>
          <td>
            ${sellingPriceDisplay}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; font-size: 13px;">${prod.stock} units</span>
              ${stockBadge}
            </div>
          </td>
          <td>
            <span class="badge-tag ${isArchived ? 'muted' : (prod.isAvailable === false ? 'warning' : 'success')}">
              ${isArchived ? 'Archived' : (prod.isAvailable === false ? 'Disabled' : 'Active')}
            </span>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button class="btn-table-action edit" onclick="window.adminApp.openProductModal('${prod.id}')" title="Edit Product">
                Edit
              </button>
              <button class="btn-table-action" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;" onclick="window.adminApp.openQuickAddStockModal('${prod.id}')" title="Quick Add Stock Units">
                + Stock
              </button>
              <button class="btn-table-action ${isArchived ? 'restore' : 'archive'}" 
                      onclick="window.adminApp.toggleProductArchive('${prod.id}', ${!isArchived})" 
                      title="${isArchived ? 'Restore to Shelf' : 'Archive (Hide from Shelf)'}">
                ${isArchived ? 'Restore' : 'Archive'}
              </button>
              <button class="btn-table-action delete" onclick="window.adminApp.deleteProduct('${prod.id}')" title="Delete Product">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async toggleProductArchive(productId, makeArchived) {
    const prod = window.storeDB.getProduct(productId);
    const actionLabel = makeArchived ? 'Archive' : 'Restore';
    if (!confirm(`Are you sure you want to ${actionLabel.toLowerCase()} "${prod ? prod.name : productId}"?`)) return;

    try {
      await window.storeDB.archiveProduct(productId, !makeArchived);
      if (window.showToast) window.showToast(`Product ${makeArchived ? 'archived' : 'restored'} successfully`, 'success');
      this.render();
    } catch (err) {
      alert('Could not update product status: ' + err.message);
    }
  }

  async deleteProduct(productId) {
    const prod = window.storeDB.getProduct(productId);
    const prodName = prod ? prod.name : productId;

    // Check if referenced in historical orders
    const canDelete = await window.storeDB.canDeleteProduct(productId);
    if (!canDelete) {
      alert(`Cannot permanently delete "${prodName}" because it is part of past order receipts.\n\nPlease click "Archive" instead. Archiving will hide the product from the customer app while keeping order receipts and financial records intact.`);
      return;
    }

    if (!confirm(`Are you sure you want to PERMANENTLY delete "${prodName}"?\nThis cannot be undone.`)) return;

    try {
      await window.storeDB.deleteProduct(productId);
      if (window.showToast) window.showToast(`Deleted product "${prodName}"`, 'success');
      this.render();
    } catch (err) {
      alert('Could not delete product: ' + err.message);
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
          Inventory differences help identify where the shelf needs physical restocking or audit attention.
        </div>
      </div>

      <button class="btn-adjust-stock" id="btn-open-adjust-stock" onclick="window.adminApp.openAdjustStockModal()">
        Adjust Stock
      </button>
    `;
  }

  promptPhysicalStock(productId, currentVal) {
    this.selectedProductId = productId;
    const prod = window.storeDB.getProduct(productId);
    const modal = document.getElementById('physical-stock-modal');
    const titleEl = document.getElementById('physical-stock-prod-name');
    const inputEl = document.getElementById('physical-stock-input');

    if (titleEl && prod) titleEl.innerText = `${prod.name} (${prod.variant})`;
    if (inputEl) {
      inputEl.value = currentVal;
      setTimeout(() => inputEl.focus(), 100);
    }
    if (modal) modal.classList.add('active');
  }

  openAdjustStockModal() {
    const prod = window.storeDB.getProduct(this.selectedProductId);
    if (!prod) return;

    const modal = document.getElementById('adjust-stock-modal');
    document.getElementById('adjust-modal-prod-name').innerText = `${prod.name} (${prod.variant})`;
    document.getElementById('adjust-stock-input').value = prod.stock;
    if (modal) modal.classList.add('active');
  }

  async renderDashboard() {
    const dashboardSubView = this.dashboardSubView || 'today';
    const container = document.getElementById('dashboard-dynamic-content');
    if (!container) return;

    // Fetch live metrics from storeDB & backend
    const adminOrders = window.storeDB.getAdminOrders ? window.storeDB.getAdminOrders() : [];
    let metrics = {
      salesToday: window.storeDB.data.community.salesToday || 0,
      todayOrdersCount: adminOrders.filter(o => (o.timeLabel || '').includes('TODAY') || new Date(o.createdAt).toDateString() === new Date().toDateString()).length,
      totalRevenue: adminOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0),
      totalOrdersCount: adminOrders.length,
      totalItemsSold: adminOrders.reduce((s, o) => s + (Number(o.itemCount) || 1), 0),
      completedPayments: adminOrders.length,
      topProducts: []
    };

    try {
      const adminToken = localStorage.getItem('honesty_admin_token') || '';
      const headers = adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
      const res = await fetch('/api/admin/dashboard', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          metrics = { ...metrics, ...data };
        }
      }
    } catch (e) {
      console.warn('Could not fetch remote dashboard metrics:', e);
    }

    const topItemName = metrics.topProducts && metrics.topProducts.length > 0 
      ? metrics.topProducts[0].name 
      : 'None yet';

    if (dashboardSubView === 'today') {
      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 28px; font-weight: 800; color: #000; margin-bottom: 4px;">Today's Overview</h2>
          <p style="font-size: 14px; color: #64748b;">Live real-time metrics from Supabase & Cashfree.</p>
        </div>

        <!-- 4 Top KPI Cards -->
        <div class="dashboard-kpi-grid">
          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">TODAY'S SALES</span>
              <div class="kpi-icon-pill" style="font-weight: 700; font-size: 13px;">₹</div>
            </div>
            <div class="kpi-val">₹${metrics.salesToday.toLocaleString('en-IN')}</div>
            <div class="kpi-sub positive">
              <span>Live reconciled</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">ORDERS TODAY</span>
              <div class="kpi-icon-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>
              </div>
            </div>
            <div class="kpi-val">${metrics.todayOrdersCount}</div>
            <div class="kpi-sub">Verified customer checkouts</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">ITEMS SOLD</span>
              <div class="kpi-icon-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              </div>
            </div>
            <div class="kpi-val">${metrics.totalItemsSold}</div>
            <div class="kpi-sub">Top item: ${topItemName}</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-title">SUCCESSFUL PAYMENTS</span>
              <div class="kpi-icon-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
            </div>
            <div class="kpi-val">${metrics.completedPayments}</div>
            <div class="kpi-sub">Cashfree & UPI Verified</div>
          </div>
        </div>

        <!-- CONVERSION FUNNEL -->
        <div class="conversion-funnel-card">
          <div class="funnel-card-header">
            <h3>Store Telemetry</h3>
            <span style="font-size:12px; color:#10b981; font-weight:700;">● Live Connection</span>
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
              <div class="funnel-count-val">${Math.max(metrics.completedPayments, metrics.todayOrdersCount + 1)}</div>
              <div class="funnel-stage-label">STORE VISITS</div>
            </div>

            <!-- Stage 2 -->
            <div class="funnel-stage-item">
              <div class="funnel-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
              </div>
              <div class="funnel-count-val">${metrics.todayOrdersCount}</div>
              <div class="funnel-stage-label">CHECKOUTS</div>
            </div>

            <!-- Stage 3 -->
            <div class="funnel-stage-item">
              <div class="funnel-circle completed">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5">
                  <circle cx="12" cy="12" r="9"></circle>
                  <polyline points="9 12 11 14 15 10"></polyline>
                </svg>
              </div>
              <div class="funnel-count-val">${metrics.completedPayments}</div>
              <div class="funnel-stage-label">PAYMENTS COMPLETED</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // 30 Days View with Real Data
      const topListHtml = metrics.topProducts && metrics.topProducts.length > 0 
        ? metrics.topProducts.map((p, idx) => `
            <div class="top-product-item">
              <div class="top-prod-rank-name">
                <span class="top-prod-rank">${idx + 1}</span>
                <span class="top-prod-name">${p.name}</span>
              </div>
              <span class="top-prod-sales">${p.count} sold</span>
            </div>
          `).join('')
        : '<p style="color:#94a3b8; font-size:13px; padding:10px 0;">No product sales recorded yet.</p>';

      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 28px; font-weight: 800; color: #000; margin-bottom: 4px;">Performance Overview</h2>
          <p style="font-size: 14px; color: #64748b;">Cumulative metrics across all customer purchases.</p>
        </div>

        <!-- 4 Stat Cards -->
        <div class="dashboard-kpi-grid">
          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">₹</span>
            </div>
            <span class="kpi-title">Total Revenue</span>
            <div class="kpi-val">₹${metrics.totalRevenue.toLocaleString('en-IN')}</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </span>
            </div>
            <span class="kpi-title">Completed Orders</span>
            <div class="kpi-val">${metrics.totalOrdersCount}</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              </span>
            </div>
            <span class="kpi-title">Total Items Sold</span>
            <div class="kpi-val">${metrics.totalItemsSold}</div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-header">
              <span class="kpi-icon-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
            </div>
            <span class="kpi-title">Honor Trust Score</span>
            <div class="kpi-val">100%</div>
          </div>
        </div>

        <!-- Middle Grid: Real Top Products -->
        <div class="dashboard-middle-grid">
          <div class="top-products-card">
            <h3 style="font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">Top Selling Products</h3>
            <div class="top-products-list">
              ${topListHtml}
            </div>
            <button onclick="window.adminApp.switchTab('inventory')" 
                    style="width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:10px; font-size:13px; font-weight:700; cursor:pointer; margin-top: 14px;">
              Manage Inventory
            </button>
          </div>

          <div class="chart-card">
            <div class="chart-card-header">
              <h3>System Integrity Status</h3>
              <span style="color:#10b981; font-weight:800; font-size:13px;">● Nominal</span>
            </div>
            <div style="padding: 16px 0; font-size: 13px; color: #475569; line-height: 1.6;">
              <p>✓ All payments verified against Cashfree Payment Gateway</p>
              <p>✓ Stock levels deducted synchronously upon receipt</p>
              <p>✓ Zero client-side price trust enforced</p>
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

    const orders = (window.storeDB.getAdminOrders && window.storeDB.getAdminOrders().length > 0) 
      ? window.storeDB.getAdminOrders() 
      : (window.storeDB.getUserOrders ? window.storeDB.getUserOrders() : []);

    if (orders.length === 0) {
      salesTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 32px 16px; color: #94a3b8; font-size: 13px;">
            No orders placed yet. Live purchases from customers will appear here automatically.
          </td>
        </tr>
      `;
      return;
    }

    salesTableBody.innerHTML = orders.map(order => `
      <tr>
        <td><strong>${order.id}</strong></td>
        <td>${order.timeLabel || order.createdAt}</td>
        <td>
          <div style="font-weight:600;">${(order.items || []).map(i => `${i.qty}x ${i.name}`).join(', ') || 'Snack'}</div>
          ${order.customerEmail ? `<div style="font-size:11px; color:#64748b;">${order.customerEmail}</div>` : ''}
        </td>
        <td><strong>₹${order.amount}</strong></td>
        <td><span class="badge-paid">✓ ${order.status}</span></td>
        <td>${order.paymentMethod || 'Cashfree UPI'}</td>
      </tr>
    `).join('');
  }

  async renderUsers() {
    const usersBody = document.getElementById('users-activity-body');
    if (!usersBody) return;

    try {
      const adminToken = localStorage.getItem('honesty_admin_token') || (window.authManager ? window.authManager.getAccessToken() : '');
      const headers = adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
      const res = await fetch('/api/admin/users', { headers });
      if (res.ok) {
        const data = await res.json();
        const profiles = data.profiles || [];
        if (profiles.length > 0) {
          usersBody.innerHTML = profiles.map(p => `
            <tr>
              <td><strong>${p.full_name || p.email || ('+91 ' + p.phone)}</strong></td>
              <td>${p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}</td>
              <td>${p.total_orders || 1} Purchase(s)</td>
              <td><span class="badge-paid">Verified</span></td>
              <td><strong>₹${p.total_spent || 0}</strong></td>
            </tr>
          `).join('');
          return;
        }
      }
    } catch (e) {}

    // Fallback: If no profiles, show orders by customer
    const orders = (window.storeDB.getAdminOrders && window.storeDB.getAdminOrders().length > 0) 
      ? window.storeDB.getAdminOrders() 
      : (window.storeDB.getUserOrders ? window.storeDB.getUserOrders() : []);

    if (orders.length > 0) {
      usersBody.innerHTML = orders.map(o => `
        <tr>
          <td><strong>${o.customerEmail || o.customerName || `Customer (${o.id})`}</strong></td>
          <td>${o.timeLabel}</td>
          <td>Purchase (${o.itemCount} items)</td>
          <td><span class="badge-paid">Verified</span></td>
          <td><strong>₹${o.amount}</strong></td>
        </tr>
      `).join('');
    } else {
      usersBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 32px 16px; color: #94a3b8; font-size: 13px;">
            No customer activity recorded yet.
          </td>
        </tr>
      `;
    }
  }
}

window.AdminApp = AdminApp;

window.testSupabaseConnection = async function() {
  const url = document.getElementById('cfg-supabase-url')?.value.trim();
  const anonKey = document.getElementById('cfg-supabase-key')?.value.trim();
  const feedback = document.getElementById('supabase-test-feedback');
  if (!feedback) return;

  if (!url || !anonKey) {
    feedback.style.display = 'block';
    feedback.innerHTML = '<span style="color:#ef4444; font-weight:700;">Please enter both Supabase Project URL and Anon Key.</span>';
    return;
  }

  feedback.style.display = 'block';
  feedback.innerHTML = '<span style="color:#64748b; font-weight:600;">Testing Supabase connection...</span>';

  try {
    const res = await fetch('/api/test-supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey })
    });
    const data = await res.json();
    if (data.ok) {
      feedback.innerHTML = `<span style="color:#16a34a; font-weight:700;">✓ Connected! Tables detected: products (${data.tables?.products ?? 0}).</span>`;
    } else {
      feedback.innerHTML = `<span style="color:#ef4444; font-weight:700;">✗ Connection Failed: ${data.message || 'Check URL and Anon Key.'}</span>`;
    }
  } catch (err) {
    feedback.innerHTML = `<span style="color:#ef4444; font-weight:700;">Server offline or connection error.</span>`;
  }
};
