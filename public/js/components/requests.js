window.RequestsComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/requests');
      const currentUser = window.api.getCurrentUser();
      
      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Inter-Department Requests</h1>
            <p>Manage requisitions, transfers, and approvals.</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.RequestsComponent.showAddModal()">
              <i class="fas fa-plus"></i> New Request
            </button>
          </div>
        </div>
      `;

      // Status filters
      html += `
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
          <div class="badge badge-warning" style="font-size: 0.9rem; padding: 0.5rem 1rem; cursor: pointer;">Pending Approvals</div>
          <div class="badge badge-success" style="font-size: 0.9rem; padding: 0.5rem 1rem; cursor: pointer; opacity: 0.7;">Approved</div>
          <div class="badge badge-danger" style="font-size: 0.9rem; padding: 0.5rem 1rem; cursor: pointer; opacity: 0.7;">Rejected</div>
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
                ${data.requests.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">No requests found</td></tr>' : ''}
                ${data.requests.map(req => this.createTableRow(req, currentUser)).join('')}
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

  createTableRow(req, user) {
    let statusClass = 'warning';
    let statusLabel = 'Pending';
    let iconClass = 'fa-clock';
    
    if (req.status === 'approved') { statusClass = 'success'; statusLabel = 'Approved'; iconClass = 'fa-check'; }
    if (req.status === 'rejected') { statusClass = 'danger'; statusLabel = 'Rejected'; iconClass = 'fa-times'; }

    let typeFormatted = req.request_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Detail format
    let details = '';
    if (req.product_name) {
      details = `<strong>${req.quantity}</strong> ${req.product_unit} of <strong>${req.product_name}</strong>`;
    } else if (req.quantity > 0) {
      details = `Quantity: <strong>${req.quantity}</strong>`;
    }
    if (req.notes) {
      details += `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;" title="${req.notes}">
        <i class="fas fa-comment-alt"></i> ${req.notes.substring(0, 30)}${req.notes.length > 30 ? '...' : ''}
      </div>`;
    }

    // Determine if user can approve
    // User is an admin OR user is the head of the target department
    const isAdmin = user.role === 'hr_admin' || user.role === 'system_admin';
    const isTargetDeptHead = user.role === 'dept_head' && (req.target_department_id === user.departmentId || (!req.target_department_id && req.department_id === user.departmentId));
    const canApprove = req.status === 'pending' && (isAdmin || isTargetDeptHead);

    return `
      <tr>
        <td>
          <div style="font-weight: 500;">${typeFormatted}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">REQ-${req.id.toString().padStart(4, '0')} | Prio: ${req.priority}</div>
        </td>
        <td>
          <div>${req.requester_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${req.department_name}</div>
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
    let inventory = [];
    try {
      const res = await window.api.get('/inventory');
      inventory = res.items;
    } catch (e) { console.error('Failed to load inventory'); }

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
              <option value="material_requisition">Material Requisition (Raw Materials)</option>
              <option value="transfer_to_fg">Transfer to Finished Goods</option>
              <option value="shipping_request">Shipping Request</option>
              <option value="stock_adjustment">Stock Adjustment / Correction</option>
              <option value="other">Other Request</option>
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
                <option value="5">HR & Admin</option>
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
          
          <div class="grid-2" id="product-fields">
            <div class="form-group">
              <label>Product / Material</label>
              <select id="req-product">
                <option value="">-- Select Product --</option>
                ${inventory.map(i => `<option value="${i.product_id}">${i.name} (${i.quantity_on_hand} ${i.unit} avail)</option>`).join('')}
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
  },

  toggleReqFields(type) {
    const prodFields = document.getElementById('product-fields');
    const targetDept = document.getElementById('req-target-dept');
    
    if (type === 'material_requisition' || type === 'stock_adjustment') {
      prodFields.style.display = 'grid';
      if (type === 'material_requisition') targetDept.value = "1"; // Default to Raw Materials
    } else {
      prodFields.style.display = 'none';
      if (type === 'transfer_to_fg') targetDept.value = "3";
      if (type === 'shipping_request') targetDept.value = "4";
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
      data.quantity = parseInt(document.getElementById('req-qty').value || 0);
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
    
    // In a real app, we'd open a modal to ask for a comment. Keeping simple here.
    try {
      await window.api.patch(`/requests/${id}/approve`, { action, comment: '' });
      window.showToast(`Request ${action} successfully`);
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};
