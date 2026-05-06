window.ProductionComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/production');
      
      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Production Operations</h1>
            <p>Manage and track manufacturing jobs.</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.ProductionComponent.showAddModal()">
              <i class="fas fa-plus"></i> Schedule New Job
            </button>
          </div>
        </div>
      `;

      // Stats Grid
      html += `
        <div class="dashboard-grid mb-3" style="grid-template-columns: repeat(4, 1fr);">
          <div class="content-card text-center" style="border-bottom: 3px solid var(--info-color);">
            <div style="font-size: 2rem; color: var(--info-color); font-weight: 700;">${data.stats.scheduled}</div>
            <div class="text-muted">Scheduled</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--warning-color);">
            <div style="font-size: 2rem; color: var(--warning-color); font-weight: 700;">${data.stats.inProgress}</div>
            <div class="text-muted">In Progress</div>
          </div>
          <div class="content-card text-center" style="border-bottom: 3px solid var(--success-color);">
            <div style="font-size: 2rem; color: var(--success-color); font-weight: 700;">${data.stats.completed}</div>
            <div class="text-muted">Completed</div>
          </div>
          <div class="content-card text-center">
            <div style="font-size: 2rem; color: var(--primary-light); font-weight: 700;">${((data.stats.totalCompleted / (data.stats.totalRequested || 1)) * 100).toFixed(1)}%</div>
            <div class="text-muted">Overall Completion Yield</div>
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
                  <th>Job ID / Product</th>
                  <th>Machine</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Defects</th>
                  <th>Scheduled Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.jobs.map(job => this.createTableRow(job)).join('')}
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

  createTableRow(job) {
    let statusClass = 'secondary';
    let statusLabel = 'Scheduled';
    
    if (job.status === 'in_progress') { statusClass = 'warning'; statusLabel = 'In Progress'; }
    if (job.status === 'completed') { statusClass = 'success'; statusLabel = 'Completed'; }
    if (job.status === 'cancelled') { statusClass = 'danger'; statusLabel = 'Cancelled'; }

    const progress = job.quantity_requested > 0 ? Math.min(100, Math.round((job.quantity_completed / job.quantity_requested) * 100)) : 0;

    return `
      <tr>
        <td>
          <div style="font-weight: 500;">${job.product_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Job #${job.id} | Priority: ${job.priority.toUpperCase()}</div>
        </td>
        <td>${job.machine || 'Unassigned'}</td>
        <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
        <td style="min-width: 150px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 2px;">
            <span>${job.quantity_completed} / ${job.quantity_requested}</span>
            <span>${progress}%</span>
          </div>
          <div style="width: 100%; background: var(--dark-border); border-radius: 4px; height: 6px; overflow: hidden;">
            <div style="width: ${progress}%; background: var(--${statusClass}-color, var(--primary-color)); height: 100%;"></div>
          </div>
        </td>
        <td class="${job.defects > 0 ? 'text-danger font-weight-bold' : 'text-muted'}">${job.defects}</td>
        <td>${window.formatDate(job.scheduled_date)}</td>
        <td>
          ${job.status !== 'completed' && job.status !== 'cancelled' ? `
            <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                    onclick='window.ProductionComponent.showUpdateModal(${JSON.stringify(job).replace(/'/g, "&apos;")})'>
              <i class="fas fa-cog"></i> Update
            </button>
          ` : '<span class="text-muted" style="font-size: 0.8rem;">Finished</span>'}
        </td>
      </tr>
    `;
  },

  showAddModal() {
    const html = `
      <div class="modal-header">
        <h2>Schedule Production Job</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="add-job-form" onsubmit="window.ProductionComponent.submitAdd(event)">
          <div class="form-group">
            <label>Product Name/Specification*</label>
            <input type="text" id="job-product" required placeholder="e.g. 28mm Preform (Clear)">
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Target Quantity*</label>
              <input type="number" id="job-qty" min="1" required>
            </div>
            <div class="form-group">
              <label>Machine Assignment</label>
              <input type="text" id="job-machine" placeholder="e.g. Injection Mold M1">
            </div>
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Priority*</label>
              <select id="job-priority" required>
                <option value="low">Low</option>
                <option value="normal" selected>Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div class="form-group">
              <label>Scheduled Date</label>
              <input type="date" id="job-date">
            </div>
          </div>
          
          <div class="form-group">
            <label>Notes/Instructions</label>
            <textarea id="job-notes" rows="2"></textarea>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-job">Schedule Job</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitAdd(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-job');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';

    const data = {
      productName: document.getElementById('job-product').value,
      quantityRequested: parseInt(document.getElementById('job-qty').value),
      machine: document.getElementById('job-machine').value,
      priority: document.getElementById('job-priority').value,
      scheduledDate: document.getElementById('job-date').value || null,
      notes: document.getElementById('job-notes').value
    };

    try {
      await window.api.post('/production', data);
      window.showToast('Production job scheduled');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Schedule Job';
    }
  },

  showUpdateModal(job) {
    const isScheduled = job.status === 'scheduled';
    
    const html = `
      <div class="modal-header">
        <h2>Update Job #${job.id}: ${job.product_name}</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="update-job-form" onsubmit="window.ProductionComponent.submitUpdate(event, ${job.id})">
          <div class="form-group">
            <label>Status</label>
            <select id="update-status" onchange="window.ProductionComponent.toggleCompletionFields(this.value)" required>
              ${isScheduled ? '<option value="scheduled" selected>Scheduled</option>' : ''}
              <option value="in_progress" ${job.status === 'in_progress' ? 'selected' : ''}>In Progress (Running)</option>
              <option value="completed">Completed (Finish Job)</option>
            </select>
          </div>
          
          <div id="progress-fields" style="display: ${job.status === 'in_progress' ? 'block' : 'none'};">
            <div class="grid-2">
              <div class="form-group">
                <label>Completed Quantity</label>
                <input type="number" id="update-qty" min="0" value="${job.quantity_completed}">
                <small class="text-muted">Target: ${job.quantity_requested}</small>
              </div>
              <div class="form-group">
                <label>Defect Quantity</label>
                <input type="number" id="update-defects" min="0" value="${job.defects}">
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>Update Notes/Log</label>
            <textarea id="update-notes" rows="2">${job.notes || ''}</textarea>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-update-job">Save Update</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
    // Initialize view state
    this.toggleCompletionFields(isScheduled ? 'scheduled' : 'in_progress');
  },

  toggleCompletionFields(status) {
    const fields = document.getElementById('progress-fields');
    if (fields) {
      if (status === 'scheduled') {
        fields.style.display = 'none';
      } else {
        fields.style.display = 'block';
      }
    }
  },

  async submitUpdate(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btn-update-job');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const status = document.getElementById('update-status').value;
    const data = {
      status,
      notes: document.getElementById('update-notes').value
    };

    if (status !== 'scheduled') {
      data.quantityCompleted = parseInt(document.getElementById('update-qty').value || 0);
      data.defects = parseInt(document.getElementById('update-defects').value || 0);
    }

    try {
      await window.api.patch(`/production/${id}`, data);
      window.showToast(status === 'completed' ? 'Job completed and sent to FG' : 'Job updated successfully');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Save Update';
    }
  }
};
