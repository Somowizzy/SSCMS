window.RequestsComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/requests');
      const currentUser = window.api.getCurrentUser();

      // Only dept_head, hr_admin, system_admin can take actions
      const isDeptHead = currentUser && currentUser.role === 'dept_head';
      const isAdmin    = currentUser && (currentUser.role === 'hr_admin' || currentUser.role === 'system_admin');
      const canAct     = isDeptHead || isAdmin;

      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Inter-Department Requests</h1>
            <p>Manage requisitions, transfers, and approvals.</p>
          </div>
          <div class="header-actions">
            ${canAct ? `
            <button class="btn btn-primary" onclick="window.RequestsComponent.showAddModal()">
              <i class="fas fa-plus"></i> New Request
            </button>` : ''}
          </div>
        </div>
      `;

      const requests = data.requests || [];

      // Summary cards
      const pending  = requests.filter(r => r.status === 'pending').length;
      const approved = requests.filter(r => r.status === 'approved').length;
      const rejected = requests.filter(r => r.status === 'rejected').length;

      html += `
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <div class="badge badge-warning" style="font-size: 0.9rem; padding: 0.5rem 1rem;">
            <i class="fas fa-clock"></i> Pending: ${pending}
          </div>
          <div class="badge badge-success" style="font-size: 0.9rem; padding: 0.5rem 1rem;">
            <i class="fas fa-check"></i> Approved: ${approved}
          </div>
          <div class="badge badge-danger" style="font-size: 0.9rem; padding: 0.5rem 1rem;">
            <i class="fas fa-times"></i> Rejected: ${rejected}
          </div>
          ${!canAct ? `<div class="badge badge-info" style="font-size:0.9rem;padding:0.5rem 1rem;">
            <i class="fas fa-eye"></i> View-only — only Department Heads can submit or action requests
          </div>` : ''}
        </div>
      `;

      // Table
      html += `
        <div class="content-card">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Request ID / Type</th>
                  <th>Requester</th>
                  <th>Target Dept.</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${requests.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">No requests found</td></tr>' : ''}
                ${requests.map(req => this.createTableRow(req, currentUser, canAct)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      container.innerHTML = html;

    } catch (err) {
      console.error('Requests render error:', err);
      container.innerHTML = `
        <div class="page-header">
          <div class="page-title">
            <h1>Inter-Department Requests</h1>
            <p>Manage requisitions, transfers, and approvals.</p>
          </div>
        </div>
        <div class="content-card" style="padding: 2rem; text-align: center;">
          <i class="fas fa-exclamation-triangle text-warning" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <h3>Unable to Load Requests</h3>
          <p class="text-muted">${err.message}</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="window.RequestsComponent.render(document.getElementById('page-content'))">
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>
      `;
    }
  },

  createTableRow(req, user, canAct) {
    let statusClass = 'warning';
    let statusLabel = 'Pending';
    let iconClass = 'fa-clock';

    if (req.status === 'approved')    { statusClass = 'success'; statusLabel = 'Approved';    iconClass = 'fa-check'; }
    if (req.status === 'rejected')    { statusClass = 'danger';  statusLabel = 'Rejected';    iconClass = 'fa-times'; }
    if (req.status === 'in_progress') { statusClass = 'info';    statusLabel = 'In Progress'; iconClass = 'fa-spinner'; }
    if (req.status === 'completed')   { statusClass = 'success'; statusLabel = 'Completed';   iconClass = 'fa-check-double'; }

    const requestType = req.request_type || 'unknown';
    let typeFormatted = requestType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Detail format
    let details = '';
    if (req.product_name) {
      details = `<strong>${req.quantity || 0}</strong> ${req.product_unit || 'units'} of <strong>${req.product_name}</strong>`;
    } else if (req.quantity > 0) {
      details = `Quantity: <strong>${req.quantity}</strong>`;
    }
    if (req.notes) {
      details += `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;" title="${req.notes}">
        <i class="fas fa-comment-alt"></i> ${req.notes.substring(0, 30)}${req.notes.length > 30 ? '...' : ''}
      </div>`;
    }

    // Only dept_head of target dept OR admin can approve/reject
    const isAdmin = user && (user.role === 'hr_admin' || user.role === 'system_admin');
    const isTargetDeptHead = user && user.role === 'dept_head' &&
      (req.target_department_id === user.departmentId || (!req.target_department_id && req.department_id === user.departmentId));
    const canApprove = req.status === 'pending' && canAct && (isAdmin || isTargetDeptHead);

    return `
      <tr>
        <td>
          <div style="font-weight: 500;">${typeFormatted}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">REQ-${String(req.id).padStart(4, '0')} | Prio: ${req.priority || 'normal'}</div>
        </td>
        <td>
          <div>${req.requester_name || 'Unknown'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${req.department_name || '-'}</div>
        </td>
        <td>${req.target_department_name || '-'}</td>
        <td style="max-width: 200px;">${details}</td>
        <td>
          <span class="badge badge-${statusClass}"><i class="fas ${iconClass}"></i> ${statusLabel}</span>
          ${req.approvals && req.approvals.length > 0 ? `
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">
              by ${req.approvals[0].approver_name}
            </div>
          ` : ''}
        </td>
        <td>${window.formatDate(req.created_at)}</td>
        <td>
          ${canApprove ? `
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-success" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;"
                      onclick="window.RequestsComponent.handleAction(${req.id}, 'approved')">
                Approve
              </button>
              <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;"
                      onclick="window.RequestsComponent.handleAction(${req.id}, 'rejected')">
                Reject
              </button>
            </div>
          ` : '<span class="text-muted" style="font-size: 0.8rem;">No Actions</span>'}
        </td>
      </tr>
    `;
  },

  async showAddModal() {
    const currentUser = window.api.getCurrentUser();
    if (!currentUser) return;

    // Load products based on department of the logged-in dept_head
    let inventory     = [];
    let shippingItems = [];

    // Determine user's department (id)
    const deptId = currentUser.departmentId;

    // For shipping dept head (dept id=4): load ALL finished goods including under_review
    if (deptId === 4 || currentUser.role === 'hr_admin' || currentUser.role === 'system_admin') {
      try {
        const res = await window.api.get('/finished-goods');
        // Shipping dept sees everything: passed, under_review, pending
        shippingItems = (res.items || []).filter(i => i.quantity > 0);
      } catch (e) { console.error('Failed to load finished goods'); }
    }

    // All dept heads can see raw material inventory
    try {
      const res = await window.api.get('/inventory');
      inventory = res.items || [];
    } catch (e) { console.error('Failed to load inventory'); }

    // Build request type options based on department
    let requestTypeOptions = '';
    if (deptId === 1 || currentUser.role === 'hr_admin' || currentUser.role === 'system_admin') {
      // Raw Materials
      requestTypeOptions += `<option value="material_requisition">Material Requisition (Raw Materials)</option>`;
      requestTypeOptions += `<option value="stock_adjustment">Stock Adjustment / Correction</option>`;
    }
    if (deptId === 2 || currentUser.role === 'hr_admin' || currentUser.role === 'system_admin') {
      // Production
      requestTypeOptions += `<option value="production_run">Production Run Request</option>`;
      requestTypeOptions += `<option value="transfer_to_fg">Transfer to Finished Goods</option>`;
    }
    if (deptId === 3 || currentUser.role === 'hr_admin' || currentUser.role === 'system_admin') {
      // Finished Goods
      requestTypeOptions += `<option value="transfer_to_fg">Transfer to Finished Goods</option>`;
      requestTypeOptions += `<option value="stock_adjustment">Stock Adjustment / Correction</option>`;
    }
    if (deptId === 4 || currentUser.role === 'hr_admin' || currentUser.role === 'system_admin') {
      // Shipping
      requestTypeOptions += `<option value="shipping_request">Shipping Request</option>`;
    }
    // Admin/HR can do everything
    if (currentUser.role === 'hr_admin' || currentUser.role === 'system_admin') {
      requestTypeOptions += `<option value="material_requisition">Material Requisition (Raw Materials)</option>`;
      requestTypeOptions += `<option value="stock_adjustment">Stock Adjustment / Correction</option>`;
      requestTypeOptions += `<option value="production_run">Production Run Request</option>`;
      requestTypeOptions += `<option value="transfer_to_fg">Transfer to Finished Goods</option>`;
    }
    // Deduplicate options (use Set on values)
    requestTypeOptions = this._deduplicateOptions(requestTypeOptions);

    const productOptionsInv = inventory.map(i =>
      `<option value="${i.product_id}">${i.name} (${i.quantity_on_hand} ${i.unit} avail)</option>`
    ).join('');

    // Shipping items includes all statuses
    const productOptionsShip = shippingItems.map(i =>
      `<option value="${i.id}" data-name="${i.product_name}" data-max="${i.quantity}" data-status="${i.quality_status}">
        ${i.product_name} (${i.quantity.toLocaleString()} avail) ${i.quality_status !== 'passed' ? '⚠ ' + i.quality_status : ''}
      </option>`
    ).join('');

    const isShipping = (deptId === 4);

    const html = `
      <div class="modal-header">
        <h2>Submit New Request</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="add-req-form" onsubmit="window.RequestsComponent.submitAdd(event)">
          <div class="form-group">
            <label>Request Type*</label>
            <select id="req-type" required onchange="window.RequestsComponent.toggleReqFields(this.value)">
              ${requestTypeOptions || '<option value="material_requisition">Material Requisition</option>'}
            </select>
          </div>

          <div class="grid-2">
            <div class="form-group" id="target-dept-group">
              <label>Target Department</label>
              <select id="req-target-dept">
                <option value="1">Raw Materials</option>
                <option value="2">Production</option>
                <option value="3">Finished Goods</option>
                <option value="4">Shipping</option>
                <option value="5">HR &amp; Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label>Priority</label>
              <select id="req-priority">
                <option value="low">Low</option>
                <option value="normal" selected>Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          ${isShipping ? `
          <div class="form-group" id="shipping-product-group">
            <label>Finished Good / Product for Shipment
              <small style="color:var(--text-muted);font-weight:400;">(includes items under review)</small>
            </label>
            <select id="req-shipping-product">
              <option value="">-- Select Finished Good --</option>
              ${productOptionsShip}
            </select>
          </div>` : ''}

          <div class="grid-2" id="product-fields">
            <div class="form-group">
              <label>Product / Material</label>
              <select id="req-product">
                <option value="">-- Select Product --</option>
                ${productOptionsInv}
              </select>
            </div>
            <div class="form-group">
              <label>Quantity</label>
              <input type="number" id="req-qty" min="1">
            </div>
          </div>

          <div class="form-group">
            <label>Notes / Justification*</label>
            <textarea id="req-notes" rows="3" required placeholder="Provide reason for this request..."></textarea>
          </div>

          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-req">Submit Request</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);

    // Apply initial field toggle
    const typeEl = document.getElementById('req-type');
    if (typeEl) this.toggleReqFields(typeEl.value);
  },

  /** Remove duplicate <option> values from an HTML string */
  _deduplicateOptions(html) {
    const seen = new Set();
    return html.replace(/<option value="([^"]*)"[^>]*>[^<]*<\/option>/g, (match, val) => {
      if (seen.has(val)) return '';
      seen.add(val);
      return match;
    });
  },

  toggleReqFields(type) {
    const prodFields  = document.getElementById('product-fields');
    const targetDept  = document.getElementById('req-target-dept');
    const shipGroup   = document.getElementById('shipping-product-group');

    if (shipGroup) shipGroup.style.display = 'none';

    if (type === 'material_requisition' || type === 'stock_adjustment') {
      if (prodFields) prodFields.style.display = 'grid';
      if (type === 'material_requisition' && targetDept) targetDept.value = '1';
    } else if (type === 'shipping_request') {
      if (prodFields) prodFields.style.display = 'none';
      if (targetDept) targetDept.value = '4';
      if (shipGroup) shipGroup.style.display = 'block';
    } else {
      if (prodFields) prodFields.style.display = 'none';
      if (type === 'transfer_to_fg'  && targetDept) targetDept.value = '3';
      if (type === 'production_run'  && targetDept) targetDept.value = '2';
    }
  },

  async submitAdd(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-req');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    const type = document.getElementById('req-type').value;
    const data = {
      requestType: type,
      targetDepartmentId: parseInt(document.getElementById('req-target-dept').value),
      priority: document.getElementById('req-priority').value,
      notes: document.getElementById('req-notes').value
    };

    if (type === 'material_requisition' || type === 'stock_adjustment') {
      data.productId = document.getElementById('req-product').value || null;
      data.quantity  = parseInt(document.getElementById('req-qty').value || 0);
    } else if (type === 'shipping_request') {
      const shipProd = document.getElementById('req-shipping-product');
      data.productId = shipProd ? (shipProd.value || null) : null;
      data.quantity  = parseInt(document.getElementById('req-qty')?.value || 0);
    } else {
      data.quantity = parseInt(document.getElementById('req-qty')?.value || 0);
    }

    try {
      await window.api.post('/requests', data);
      window.showToast('Request submitted successfully');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Submit Request';
    }
  },

  async handleAction(id, action) {
    if (!confirm(`Are you sure you want to mark this request as ${action}?`)) return;

    try {
      await window.api.patch(`/requests/${id}/approve`, { action, comment: '' });
      window.showToast(`Request ${action} successfully`);
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};
