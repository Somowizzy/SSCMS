window.InventoryComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/inventory');
      
      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Inventory Management</h1>
            <p>Manage raw materials and packaging inventory.</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.InventoryComponent.showAddModal()">
              <i class="fas fa-plus"></i> Add New Item
            </button>
          </div>
        </div>
      `;

      // Stats Grid
      html += `
        <div class="dashboard-grid mb-3" style="grid-template-columns: repeat(4, 1fr);">
          <div class="content-card text-center">
            <div style="font-size: 2rem; color: var(--primary-light); font-weight: 700;">${data.stats.totalItems}</div>
            <div class="text-muted">Total Items</div>
          </div>
          <div class="content-card text-center">
            <div style="font-size: 2rem; color: var(--success-color); font-weight: 700;">${data.stats.inStockCount}</div>
            <div class="text-muted">In Stock</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--warning-color);">
            <div style="font-size: 2rem; color: var(--warning-color); font-weight: 700;">${data.stats.lowStockCount}</div>
            <div class="text-muted">Low Stock</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--danger-color);">
            <div style="font-size: 2rem; color: var(--danger-color); font-weight: 700;">${data.stats.outOfStockCount}</div>
            <div class="text-muted">Out of Stock</div>
          </div>
        </div>
      `;

      // Filters
      html += `
        <div class="content-card mb-3 flex-between">
          <div class="search-bar" style="display: flex;">
            <i class="fas fa-search"></i>
            <input type="text" id="inventory-search" placeholder="Search products..." oninput="window.InventoryComponent.filterTable()">
          </div>
          <div style="display: flex; gap: 1rem;">
            <select id="inventory-category-filter" class="form-control" style="width: auto;" onchange="window.InventoryComponent.filterTable()">
              <option value="">All Categories</option>
              <option value="raw_material">Raw Materials</option>
              <option value="packaging">Packaging</option>
              <option value="consumable">Consumables</option>
            </select>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--text-muted);">
              <input type="checkbox" id="inventory-low-stock" onchange="window.InventoryComponent.filterTable()"> Show Low Stock Only
            </label>
          </div>
        </div>
      `;

      // Table
      html += `
        <div class="content-card">
          <div class="table-container">
            <table id="inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.map(item => this.createTableRow(item)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      container.innerHTML = html;
      this.items = data.items;

    } catch (err) {
      container.innerHTML = `<div class="login-error text-center p-3">${err.message}</div>`;
    }
  },

  createTableRow(item) {
    let statusClass = 'success';
    let statusText = 'In Stock';
    
    if (item.quantity_on_hand <= 0) {
      statusClass = 'danger';
      statusText = 'Out of Stock';
    } else if (item.quantity_on_hand <= item.reorder_level) {
      statusClass = 'warning';
      statusText = 'Low Stock';
    }

    const value = item.quantity_on_hand * item.unit_price;

    return `
      <tr class="inventory-row" 
          data-name="${item.name.toLowerCase()}" 
          data-category="${item.category}" 
          data-low="${item.quantity_on_hand <= item.reorder_level}">
        <td>
          <div style="font-weight: 500;">${item.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Batch: ${item.batch_no || 'N/A'}</div>
        </td>
        <td><span class="badge badge-secondary" style="background: rgba(255,255,255,0.1);">${item.category.replace('_', ' ')}</span></td>
        <td>${item.location || 'Warehouse'}</td>
        <td><strong>${item.quantity_on_hand}</strong> ${item.unit}</td>
        <td><span class="badge badge-${statusClass}">${statusText}</span></td>
        <td>${window.formatCurrency(value)}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                  onclick='window.InventoryComponent.showEditModal(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
            <i class="fas fa-edit"></i> Edit
          </button>
        </td>
      </tr>
    `;
  },

  filterTable() {
    const search = document.getElementById('inventory-search').value.toLowerCase();
    const category = document.getElementById('inventory-category-filter').value;
    const lowStock = document.getElementById('inventory-low-stock').checked;
    
    document.querySelectorAll('.inventory-row').forEach(row => {
      const matchSearch = row.dataset.name.includes(search);
      const matchCat = !category || row.dataset.category === category;
      const matchLow = !lowStock || row.dataset.low === "true";
      
      if (matchSearch && matchCat && matchLow) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  async showAddModal() {
    let suppliers = [];
    try {
      const res = await window.api.get('/inventory/suppliers');
      suppliers = res.suppliers;
    } catch (e) { console.error('Failed to load suppliers'); }

    const html = `
      <div class="modal-header">
        <h2>Add New Inventory Item</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="add-inventory-form" onsubmit="window.InventoryComponent.submitAdd(event)">
          <div class="grid-2">
            <div class="form-group">
              <label>Product Name*</label>
              <input type="text" id="add-name" required>
            </div>
            <div class="form-group">
              <label>Category*</label>
              <select id="add-category" required>
                <option value="raw_material">Raw Material</option>
                <option value="packaging">Packaging</option>
                <option value="consumable">Consumable</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label>Description</label>
            <textarea id="add-desc" rows="2"></textarea>
          </div>
          
          <div class="grid-3">
            <div class="form-group">
              <label>Unit*</label>
              <input type="text" id="add-unit" value="kg" required>
            </div>
            <div class="form-group">
              <label>Unit Price ($)</label>
              <input type="number" id="add-price" step="0.01" min="0" value="0">
            </div>
            <div class="form-group">
              <label>Reorder Level</label>
              <input type="number" id="add-reorder" min="0" value="10">
            </div>
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Initial Quantity</label>
              <input type="number" id="add-qty" min="0" value="0">
            </div>
            <div class="form-group">
              <label>Batch/Lot Number</label>
              <input type="text" id="add-batch">
            </div>
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Location</label>
              <input type="text" id="add-location" value="Warehouse A">
            </div>
            <div class="form-group">
              <label>Supplier</label>
              <select id="add-supplier">
                <option value="">-- Select Supplier --</option>
                ${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
              </select>
            </div>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-add">Save Product</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitAdd(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-add');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const data = {
      name: document.getElementById('add-name').value,
      category: document.getElementById('add-category').value,
      description: document.getElementById('add-desc').value,
      unit: document.getElementById('add-unit').value,
      unitPrice: parseFloat(document.getElementById('add-price').value || 0),
      reorderLevel: parseInt(document.getElementById('add-reorder').value || 0),
      quantity: parseInt(document.getElementById('add-qty').value || 0),
      batchNo: document.getElementById('add-batch').value,
      location: document.getElementById('add-location').value,
      supplierId: document.getElementById('add-supplier').value || null
    };

    try {
      await window.api.post('/inventory', data);
      window.showToast('Product added successfully');
      window.closeModal();
      this.render(document.getElementById('page-content')); // Reload view
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Save Product';
    }
  },

  showEditModal(item) {
    const html = `
      <div class="modal-header">
        <h2>Edit Inventory: ${item.name}</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="edit-inventory-form" onsubmit="window.InventoryComponent.submitEdit(event, ${item.id})">
          <div class="grid-2">
            <div class="form-group">
              <label>Update Quantity (${item.unit})</label>
              <input type="number" id="edit-qty" value="${item.quantity_on_hand}" required>
            </div>
            <div class="form-group">
              <label>Location</label>
              <input type="text" id="edit-location" value="${item.location || ''}">
            </div>
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Reorder Level</label>
              <input type="number" id="edit-reorder" value="${item.reorder_level}">
            </div>
            <div class="form-group">
              <label>Unit Price ($)</label>
              <input type="number" id="edit-price" step="0.01" value="${item.unit_price}">
            </div>
          </div>
          
          <div class="form-group">
            <label>Batch/Lot Number</label>
            <input type="text" id="edit-batch" value="${item.batch_no || ''}">
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-edit">Save Changes</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitEdit(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-edit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const data = {
      quantityOnHand: parseInt(document.getElementById('edit-qty').value),
      location: document.getElementById('edit-location').value,
      reorderLevel: parseInt(document.getElementById('edit-reorder').value),
      unitPrice: parseFloat(document.getElementById('edit-price').value),
      batchNo: document.getElementById('edit-batch').value
    };

    try {
      await window.api.patch(`/inventory/${id}`, data);
      window.showToast('Inventory updated successfully');
      window.closeModal();
      this.render(document.getElementById('page-content')); // Reload view
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Save Changes';
    }
  }
};
