window.UsersComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/users');
      
      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>User & Role Management</h1>
            <p>Manage system access, roles, and departments.</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.UsersComponent.showAddModal()">
              <i class="fas fa-user-plus"></i> Add User
            </button>
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${data.users.map(u => this.createTableRow(u)).join('')}
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

  createTableRow(u) {
    const roleFormatted = u.role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    let roleClass = 'info';
    if (u.role === 'hr_admin' || u.role === 'system_admin') roleClass = 'danger';
    if (u.role === 'dept_head') roleClass = 'primary';

    const isActive = u.is_active === 1;

    return `
      <tr style="${!isActive ? 'opacity: 0.6;' : ''}">
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="avatar-circle" style="width: 32px; height: 32px; font-size: 0.8rem;">
              ${u.first_name.charAt(0)}${u.last_name.charAt(0)}
            </div>
            <div style="font-weight: 500;">${u.first_name} ${u.last_name}</div>
          </div>
        </td>
        <td style="color: var(--text-muted);">${u.email}</td>
        <td>${u.department_name || 'System'}</td>
        <td><span class="badge badge-${roleClass}">${roleFormatted}</span></td>
        <td>
          ${isActive 
            ? '<span class="text-success"><i class="fas fa-check-circle"></i> Active</span>' 
            : '<span class="text-danger"><i class="fas fa-times-circle"></i> Inactive</span>'}
        </td>
        <td style="font-size: 0.8rem;">${u.last_login ? window.formatDateTime(u.last_login) : 'Never'}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                  onclick='window.UsersComponent.showEditModal(${JSON.stringify(u).replace(/'/g, "&apos;")})'>
            <i class="fas fa-edit"></i> Edit
          </button>
        </td>
      </tr>
    `;
  },

  showAddModal() {
    const html = `
      <div class="modal-header">
        <h2>Add New User</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="add-user-form" onsubmit="window.UsersComponent.submitAdd(event)">
          <div class="grid-2">
            <div class="form-group">
              <label>First Name*</label>
              <input type="text" id="user-fname" required>
            </div>
            <div class="form-group">
              <label>Last Name*</label>
              <input type="text" id="user-lname" required>
            </div>
          </div>
          
          <div class="form-group">
            <label>Email Address*</label>
            <input type="email" id="user-email" required>
          </div>
          
          <div class="grid-2">
            <div class="form-group">
              <label>Role*</label>
              <select id="user-role" required>
                <option value="dept_user">Department User</option>
                <option value="dept_head">Department Head</option>
                <option value="hr_admin">HR & Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label>Department</label>
              <select id="user-dept">
                <option value="">-- None --</option>
                <option value="1">Raw Materials</option>
                <option value="2">Production</option>
                <option value="3">Finished Goods</option>
                <option value="4">Shipping</option>
                <option value="5">HR & Admin</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label>Initial Password*</label>
            <input type="password" id="user-pwd" required minlength="6">
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-user">Create User</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitAdd(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-user');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    const data = {
      firstName: document.getElementById('user-fname').value,
      lastName: document.getElementById('user-lname').value,
      email: document.getElementById('user-email').value,
      role: document.getElementById('user-role').value,
      departmentId: document.getElementById('user-dept').value || null,
      password: document.getElementById('user-pwd').value
    };

    try {
      await window.api.post('/users', data);
      window.showToast('User created successfully');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Create User';
    }
  },

  showEditModal(u) {
    const html = `
      <div class="modal-header">
        <h2>Edit User: ${u.first_name} ${u.last_name}</h2>
        <button class="btn-close" onclick="window.closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form onsubmit="window.UsersComponent.submitEdit(event, ${u.id})">
          <div class="grid-2">
            <div class="form-group">
              <label>Role</label>
              <select id="edit-user-role" required>
                <option value="dept_user" ${u.role === 'dept_user' ? 'selected' : ''}>Department User</option>
                <option value="dept_head" ${u.role === 'dept_head' ? 'selected' : ''}>Department Head</option>
                <option value="hr_admin" ${u.role === 'hr_admin' ? 'selected' : ''}>HR & Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label>Department</label>
              <select id="edit-user-dept">
                <option value="" ${!u.department_id ? 'selected' : ''}>-- None --</option>
                <option value="1" ${u.department_id === 1 ? 'selected' : ''}>Raw Materials</option>
                <option value="2" ${u.department_id === 2 ? 'selected' : ''}>Production</option>
                <option value="3" ${u.department_id === 3 ? 'selected' : ''}>Finished Goods</option>
                <option value="4" ${u.department_id === 4 ? 'selected' : ''}>Shipping</option>
                <option value="5" ${u.department_id === 5 ? 'selected' : ''}>HR & Admin</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label>Account Status</label>
            <select id="edit-user-status" class="form-control">
              <option value="1" ${u.is_active ? 'selected' : ''}>Active - Can log in</option>
              <option value="0" ${!u.is_active ? 'selected' : ''}>Inactive - Access revoked</option>
            </select>
          </div>
          
          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-edit-user">Save Changes</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);
  },

  async submitEdit(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btn-edit-user');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const data = {
      role: document.getElementById('edit-user-role').value,
      departmentId: document.getElementById('edit-user-dept').value || null,
      isActive: document.getElementById('edit-user-status').value === "1"
    };

    try {
      await window.api.patch(`/users/${id}`, data);
      window.showToast('User updated successfully');
      window.closeModal();
      this.render(document.getElementById('page-content'));
    } catch (err) {
      window.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Save Changes';
    }
  }
};
