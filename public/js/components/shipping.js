window.ShippingComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/shipping');
      
      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Shipping Logistics</h1>
            <p>Manage outbound shipments and deliveries.</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.ShippingComponent.showAddModal()">
              <i class="fas fa-plus"></i> Create Manifest
            </button>
          </div>
        </div>
      `;

      // Stats Grid
      html += `
        <div class="dashboard-grid mb-3" style="grid-template-columns: repeat(4, 1fr);">
          <div class="content-card text-center" style="border-bottom: 3px solid var(--primary-light);">
            <div style="font-size: 2rem; color: var(--primary-light); font-weight: 700;">${data.stats.scheduled}</div>
            <div class="text-muted">Scheduled</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--warning-color);">
            <div style="font-size: 2rem; color: var(--warning-color); font-weight: 700;">${data.stats.inTransit}</div>
            <div class="text-muted">In Transit</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--success-color);">
            <div style="font-size: 2rem; color: var(--success-color); font-weight: 700;">${data.stats.delivered}</div>
            <div class="text-muted">Delivered (30d)</div>
          </div>
          <div class="content-card text-center">
            <div style="font-size: 2rem; font-weight: 700;">${data.stats.totalItems.toLocaleString()}</div>
            <div class="text-muted">Total Units Shipped</div>
          </div>
        </div>
      `;

      // Table
      html += `
        <div class="content-card">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Manifest No.</th>
                  <th>Customer / Destination</th>
                  <th>Carrier</th>
                  <th>Status</th>
                  <th>Total Items</th>
                  <th>Pickup Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.shipments.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">No shipments found</td></tr>' : ''}
                ${data.shipments.map(s => this.createTableRow(s)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      container.innerHTML = html;

    } catch (err) {
      container.innerHTML = `<div class="login-error text-center p-3">${err.message}</div>`;
    }
  },

  createTableRow(s) {
    let statusClass = 'secondary';
    let statusLabel = 'Pending';
    
    if (s.status === 'scheduled') { statusClass = 'info'; statusLabel = 'Scheduled'; }
    if (s.status === 'in_transit') { statusClass = 'warning'; statusLabel = 'In Transit'; }
    if (s.status === 'delivered') { statusClass = 'success'; statusLabel = 'Delivered'; }
    if (s.status === 'cancelled') { statusClass = 'danger'; statusLabel = 'Cancelled'; }

    return `
      <tr>
        <td>
          <div style="font-family: monospace; font-weight: bold; color: var(--primary-light);">${s.manifest_no}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${s.customer_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fas fa-map-marker-alt"></i> ${s.destination}</div>
        </td>
        <td>${s.carrier || 'Unassigned'}</td>
        <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
        <td><strong>${s.total_items.toLocaleString()}</strong></td>
        <td>${s.scheduled_pickup ? window.formatDate(s.scheduled_pickup) : 'TBD'}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                  onclick='window.ShippingComponent.showUpdateModal(${JSON.stringify(s).replace(/'/g, "&apos;")})'>
            <i class="fas fa-edit"></i> Update
          </button>
        </td>
      </tr>
    `;
  },

  async showAddModal() {
    let fgItems = [];
    try {
      const res = await window.api.get('/finished-goods');
      // Only get items ready to ship with quantity > 0
      fgItems = res.items.filter(i => i.available_for_shipping === 1 && i.quantity > 0);
    } catch (e) { console.error('Failed to load finished goods'); }

    const html = `
      <div class="modal-header">
        <h2>Create Shipping Manifest</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="add-shipment-form" onsubmit="window.ShippingComponent.submitAdd(event)">
          <div class="grid-2">
            <div class="form-group">
              <label>Customer Name*</label>
              <input type="text" id="ship-customer" required>
            </div>
            <div class="form-group">
              <label>Destination Address*</label>
              <input type="text" id="ship-dest" required>
            </div>
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Carrier/Logistics Provider</label>
              <input type="text" id="ship-carrier" placeholder="e.g. DHL, FedEx">
            </div>
            <div class="form-group">
              <label>Scheduled Pickup Date</label>
              <input type="date" id="ship-date">
            </div>
          </div>

          <div style="border-top: 1px solid var(--dark-border); margin: 1rem 0; padding-top: 1rem;">
            <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Add Items to Shipment</h3>
            <div class="grid-2">
              <div class="form-group">
                <label>Select Finished Good</label>
                <select id="ship-item-select">
                  <option value="">-- Select Item --</option>
                  ${fgItems.map(i => `<option value="${i.id}" data-name="${i.product_name}" data-max="${i.quantity}">${i.product_name} (Avail: ${i.quantity.toLocaleString()})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Quantity to Ship</label>
                <div style="display: flex; gap: 0.5rem;">
                  <input type="number" id="ship-item-qty" min="1" style="flex: 1;">
                  <button type="button" class="btn btn-secondary" onclick="window.ShippingComponent.addShipmentItem()">Add</button>
                </div>
              </div>
            </div>
            
            <div id="shipment-items-list" class="table-container mt-2" style="max-height: 150px; overflow-y: auto;">
              <table style="font-size: 0.85rem;">
                <thead><tr><th>Product</th><th>Qty</th><th>Action</th></tr></thead>
                <tbody id="shipment-items-body">
                  <tr><td colspan="3" class="text-muted text-center">No items added yet</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="form-group mt-3">
            <label>Notes</label>
            <textarea id="ship-notes" rows="2"></textarea>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-ship">Create Manifest</button>
          </div>
        </form>
      </div>
    `;
    
    // Store selected items temporarily
    this.pendingItems = [];
    window.openModal(html);
  },

  addShipmentItem() {
    const select = document.getElementById('ship-item-select');
    const qtyInput = document.getElementById('ship-item-qty');
    const tbody = document.getElementById('shipment-items-body');
    
    if (!select.value || !qtyInput.value) return window.showToast('Select item and quantity', 'warning');
    
    const id = select.value;
    const name = select.options[select.selectedIndex].dataset.name;
    const maxQty = parseInt(select.options[select.selectedIndex].dataset.max);
    const qty = parseInt(qtyInput.value);
    
    if (qty > maxQty) return window.showToast(`Cannot exceed available quantity (${maxQty})`, 'warning');
    
    // Check if already added
    const existingIdx = this.pendingItems.findIndex(i => i.finishedGoodId == id);
    if (existingIdx >= 0) {
      if (this.pendingItems[existingIdx].quantity + qty > maxQty) {
         return window.showToast(`Total quantity cannot exceed available (${maxQty})`, 'warning');
      }
      this.pendingItems[existingIdx].quantity += qty;
    } else {
      this.pendingItems.push({ finishedGoodId: id, productName: name, quantity: qty });
    }
    
    // Render list
    tbody.innerHTML = this.pendingItems.map((item, idx) => `
      <tr>
        <td>${item.productName}</td>
        <td>${item.quantity.toLocaleString()}</td>
        <td><i class="fas fa-trash text-danger" style="cursor: pointer;" onclick="window.ShippingComponent.removeShipmentItem(${idx})"></i></td>
      </tr>
    `).join('');
    
    qtyInput.value = '';
    select.value = '';
  },

  removeShipmentItem(idx) {
    this.pendingItems.splice(idx, 1);
    const tbody = document.getElementById('shipment-items-body');
    if (this.pendingItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center">No items added yet</td></tr>';
    } else {
      tbody.innerHTML = this.pendingItems.map((item, i) => `
        <tr>
          <td>${item.productName}</td>
          <td>${item.quantity.toLocaleString()}</td>
          <td><i class="fas fa-trash text-danger" style="cursor: pointer;" onclick="window.ShippingComponent.removeShipmentItem(${i})"></i></td>
        </tr>
      `).join('');
    }
  },

  async submitAdd(e) {
    e.preventDefault();
    if (!this.pendingItems || this.pendingItems.length === 0) {
      return window.showToast('Please add at least one item to the shipment', 'warning');
    }

    const btn = document.getElementById('btn-submit-ship');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    const data = {
      customerName: document.getElementById('ship-customer').value,
      destination: document.getElementById('ship-dest').value,
      carrier: document.getElementById('ship-carrier').value,
      scheduledPickup: document.getElementById('ship-date').value || null,
      notes: document.getElementById('ship-notes').value,
      items: this.pendingItems
    };

    try {
      await window.api.post('/shipping', data);
      window.showToast('Shipment manifest created');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Create Manifest';
    }
  },

  showUpdateModal(s) {
    const html = `
      <div class="modal-header">
        <h2>Update Shipment: ${s.manifest_no}</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form onsubmit="window.ShippingComponent.submitUpdate(event, ${s.id})">
          <div class="grid-2">
            <div class="form-group">
              <label>Status</label>
              <select id="update-ship-status" required>
                <option value="pending" ${s.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="scheduled" ${s.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                <option value="in_transit" ${s.status === 'in_transit' ? 'selected' : ''}>In Transit</option>
                <option value="delivered" ${s.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                <option value="cancelled" ${s.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Carrier</label>
              <input type="text" id="update-ship-carrier" value="${s.carrier || ''}">
            </div>
          </div>
          
          <div class="form-group">
            <label>Update Notes</label>
            <textarea id="update-ship-notes" rows="2">${s.notes || ''}</textarea>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-update-ship">Save Status</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitUpdate(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btn-update-ship');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const data = {
      status: document.getElementById('update-ship-status').value,
      carrier: document.getElementById('update-ship-carrier').value,
      notes: document.getElementById('update-ship-notes').value
    };

    try {
      await window.api.patch(`/shipping/${id}`, data);
      window.showToast('Shipment updated');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Save Status';
    }
  }
};
