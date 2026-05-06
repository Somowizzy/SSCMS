window.FinishedGoodsComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/finished-goods');
      
      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Finished Goods Warehouse</h1>
            <p>Manage completed products, quality control, and prepare for shipping.</p>
          </div>
        </div>
      `;

      // Stats Grid
      html += `
        <div class="dashboard-grid mb-3" style="grid-template-columns: repeat(4, 1fr);">
          <div class="content-card text-center">
            <div style="font-size: 2rem; color: var(--primary-light); font-weight: 700;">${data.stats.totalQuantity.toLocaleString()}</div>
            <div class="text-muted">Total Units in FG</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--warning-color);">
            <div style="font-size: 2rem; color: var(--warning-color); font-weight: 700;">${data.stats.pendingQC}</div>
            <div class="text-muted">Batches Pending QC</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--success-color);">
            <div style="font-size: 2rem; color: var(--success-color); font-weight: 700;">${data.stats.readyToShip.toLocaleString()}</div>
            <div class="text-muted">Units Ready to Ship</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--danger-color);">
            <div style="font-size: 2rem; color: var(--danger-color); font-weight: 700;">${data.stats.rejectedCount}</div>
            <div class="text-muted">Rejected Batches</div>
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
                  <th>Product Name</th>
                  <th>Batch No.</th>
                  <th>Quantity</th>
                  <th>Quality Status</th>
                  <th>Available for Shipping</th>
                  <th>Production Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">No finished goods found</td></tr>' : ''}
                ${data.items.map(item => this.createTableRow(item)).join('')}
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

  createTableRow(item) {
    let qcClass = 'warning';
    let qcLabel = 'Pending QC';
    
    if (item.quality_status === 'passed') { qcClass = 'success'; qcLabel = 'QC Passed'; }
    if (item.quality_status === 'rejected') { qcClass = 'danger'; qcLabel = 'Rejected'; }
    if (item.quality_status === 'under_review') { qcClass = 'info'; qcLabel = 'Under Review'; }

    const isShippable = item.available_for_shipping === 1;

    return `
      <tr>
        <td><div style="font-weight: 500;">${item.product_name}</div></td>
        <td><span style="font-family: monospace; color: var(--text-muted);">${item.batch_no}</span></td>
        <td><strong>${item.quantity.toLocaleString()}</strong></td>
        <td><span class="badge badge-${qcClass}">${qcLabel}</span></td>
        <td>
          ${isShippable 
            ? '<span class="text-success"><i class="fas fa-check-circle"></i> Yes</span>' 
            : '<span class="text-muted"><i class="fas fa-times-circle"></i> No</span>'}
        </td>
        <td>${window.formatDate(item.produced_at)}</td>
        <td>
          ${item.quality_status === 'pending' || item.quality_status === 'under_review' ? `
            <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                    onclick='window.FinishedGoodsComponent.showQCModal(${item.id}, "${item.product_name}")'>
              <i class="fas fa-check-double"></i> Perform QC
            </button>
          ` : `
            <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                    onclick='window.FinishedGoodsComponent.showEditModal(${item.id}, ${item.available_for_shipping})'>
              <i class="fas fa-cog"></i> Status
            </button>
          `}
        </td>
      </tr>
    `;
  },

  showQCModal(id, name) {
    const html = `
      <div class="modal-header">
        <h2>Quality Control Review</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <p class="mb-3">Perform quality inspection for: <strong>${name}</strong></p>
        <form id="qc-form" onsubmit="window.FinishedGoodsComponent.submitQC(event, ${id})">
          <div class="form-group">
            <label>Inspection Result*</label>
            <select id="qc-result" required class="form-control">
              <option value="passed">Pass - Meets all quality standards</option>
              <option value="under_review">Needs Further Review - Minor issues detected</option>
              <option value="rejected">Reject - Failed quality standards</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Make Available for Shipping?</label>
            <div style="display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-main);">
                <input type="radio" name="qc-shipping" value="1" checked> Yes
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-main);">
                <input type="radio" name="qc-shipping" value="0"> No (Hold in warehouse)
              </label>
            </div>
          </div>
          
          <div class="form-group mt-3">
            <label>Inspection Notes/Remarks</label>
            <textarea id="qc-notes" rows="3" placeholder="Enter findings, defect details, or sign-off remarks..."></textarea>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-qc-submit">Submit Inspection</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitQC(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btn-qc-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    const data = {
      qualityStatus: document.getElementById('qc-result').value,
      availableForShipping: parseInt(document.querySelector('input[name="qc-shipping"]:checked').value),
      notes: document.getElementById('qc-notes').value
    };

    // Auto-disable shipping if rejected
    if (data.qualityStatus === 'rejected') {
      data.availableForShipping = 0;
    }

    try {
      await window.api.patch(`/finished-goods/${id}`, data);
      window.showToast('Quality control recorded successfully');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Submit Inspection';
    }
  },

  showEditModal(id, currentShippingStatus) {
    const html = `
      <div class="modal-header">
        <h2>Update Availability Status</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form onsubmit="window.FinishedGoodsComponent.submitEdit(event, ${id})">
          <div class="form-group">
            <label>Available for Shipping</label>
            <select id="edit-available" class="form-control">
              <option value="1" ${currentShippingStatus === 1 ? 'selected' : ''}>Yes - Ready to Ship</option>
              <option value="0" ${currentShippingStatus === 0 ? 'selected' : ''}>No - Hold in Warehouse</option>
            </select>
          </div>
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Update Status</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitEdit(e, id) {
    e.preventDefault();
    try {
      await window.api.patch(`/finished-goods/${id}`, {
        availableForShipping: parseInt(document.getElementById('edit-available').value)
      });
      window.showToast('Status updated');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};
