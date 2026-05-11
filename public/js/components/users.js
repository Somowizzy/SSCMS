window.UsersComponent = {
  async render(container) {
    const currentUser = window.api.getCurrentUser();
    // Only hr_admin / system_admin can add or edit users
    const isAdmin = currentUser && (currentUser.role === 'hr_admin' || currentUser.role === 'system_admin');

    try {
      const data = await window.api.get('/users');

      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>User &amp; Role Management</h1>
            <p>Manage system access, roles, and departments.</p>
          </div>
          <div class="header-actions">
            ${isAdmin ? `
            <button class="btn btn-primary" onclick="window.UsersComponent.showAddModal()">
              <i class="fas fa-user-plus"></i> Add User
            </button>` : ''}
          </div>
        </div>
      `;

      // Table
      html += `
        <div class="content-card">
          ${!isAdmin ? '<div style="padding:0.75rem 1.5rem;background:rgba(245,158,11,0.1);border-bottom:1px solid rgba(245,158,11,0.2);font-size:0.875rem;color:#f59e0b;"><i class="fas fa-eye"></i> View-only mode — only HR &amp; Admin can add or edit users.</div>' : ''}
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
                  ${isAdmin ? '<th>Actions</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${data.users.map(u => this.createTableRow(u, isAdmin)).join('')}
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

  createTableRow(u, isAdmin) {
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
        ${isAdmin ? `
        <td>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;"
                  onclick='window.UsersComponent.showEditModal(${JSON.stringify(u).replace(/'/g, "&apos;")})'>
            <i class="fas fa-edit"></i> Edit
          </button>
        </td>` : ''}
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
              <input type="text" id="user-fname" required oninput="window.UsersComponent.onNameInput()">
            </div>
            <div class="form-group">
              <label>Last Name* <small style="color:var(--text-muted);font-weight:400;">(used as email prefix)</small></label>
              <input type="text" id="user-lname" required oninput="window.UsersComponent.onNameInput()">
            </div>
          </div>

          <div class="form-group">
            <label>Email Address* <small style="color:var(--text-muted);font-weight:400;">(auto-generated from Last Name)</small></label>
            <input type="email" id="user-email" required placeholder="Will auto-fill from last name" style="background:rgba(255,255,255,0.04);">
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Role*</label>
              <select id="user-role" required onchange="window.UsersComponent.handleRoleChange('add')">
                <option value="dept_user">Department User</option>
                <option value="dept_head">Department Head</option>
                <option value="hr_admin">HR &amp; Admin</option>
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
                <option value="5">HR &amp; Admin</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Initial Password* <small style="color:var(--text-muted);font-weight:400;">(default: #1234#)</small></label>
            <input type="password" id="user-pwd" required minlength="6" value="#1234#">
          </div>

          <div class="modal-footer" style="padding: 1.5rem 0 0 0;">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-user">Create User</button>
          </div>
        </form>
      </div>
    `;
    window.openModal(html);

    // Apply initial role logic (default is dept_user)
    this.handleRoleChange('add');
  },

  /**
   * Auto-generate email from last name: "Tope" → "tope@sscms.com"
   * Triggered on any name input change.
   */
  onNameInput() {
    const lnameEl = document.getElementById('user-lname');
    const emailEl = document.getElementById('user-email');
    if (!lnameEl || !emailEl) return;
    const val = lnameEl.value.trim().replace(/\s+/g, '').toLowerCase();
    emailEl.value = val ? `${val}@sscms.com` : '';
  },

  /**
   * Handles role selection change to enforce business rules:
   * - HR & Admin role → auto-select HR & Admin dept (id=5), lock it
   * - Dept User / Dept Head → remove HR & Admin from department options, cannot select it
   */
  handleRoleChange(mode) {
    const prefix     = mode === 'add' ? '' : 'edit-';
    const roleSelect = document.getElementById(`${prefix}user-role`);
    const deptSelect = document.getElementById(`${prefix}user-dept`);
    if (!roleSelect || !deptSelect) return;

    const selectedRole = roleSelect.value;

    if (selectedRole === 'hr_admin') {
      // Ensure HR & Admin option exists
      let hrOption = deptSelect.querySelector('option[value="5"]');
      if (!hrOption) {
        hrOption = document.createElement('option');
        hrOption.value = '5';
        hrOption.textContent = 'HR & Admin';
        deptSelect.appendChild(hrOption);
      }
      // Show all options but force HR & Admin selection
      Array.from(deptSelect.options).forEach(opt => { opt.style.display = ''; });
      deptSelect.value    = '5';
      deptSelect.disabled = true;
      deptSelect.style.opacity = '0.7';
      deptSelect.style.cursor  = 'not-allowed';
    } else {
      // dept_user or dept_head: cannot select HR & Admin as their department
      deptSelect.disabled = false;
      deptSelect.style.opacity = '1';
      deptSelect.style.cursor  = '';

      // If currently set to HR & Admin, reset to none
      if (deptSelect.value === '5') deptSelect.value = '';

      // Hide the HR & Admin option
      Array.from(deptSelect.options).forEach(opt => {
        opt.style.display = opt.value === '5' ? 'none' : '';
      });
    }
  },

  async submitAdd(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-user');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    // Re-enable dept select temporarily to read its value
    const deptSelect  = document.getElementById('user-dept');
    const wasDisabled = deptSelect.disabled;
    deptSelect.disabled = false;

    const data = {
      firstName:    document.getElementById('user-fname').value,
      lastName:     document.getElementById('user-lname').value,
      email:        document.getElementById('user-email').value,
      role:         document.getElementById('user-role').value,
      departmentId: deptSelect.value || null,
      password:     document.getElementById('user-pwd').value || '#1234#'
    };

    deptSelect.disabled = wasDisabled;

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
              <select id="edit-user-role" required onchange="window.UsersComponent.handleRoleChange('edit')">
                <option value="dept_user"  ${u.role === 'dept_user'  ? 'selected' : ''}>Department User</option>
                <option value="dept_head"  ${u.role === 'dept_head'  ? 'selected' : ''}>Department Head</option>
                <option value="hr_admin"   ${u.role === 'hr_admin'   ? 'selected' : ''}>HR &amp; Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label>Department</label>
              <select id="edit-user-dept">
                <option value=""  ${!u.department_id       ? 'selected' : ''}>-- None --</option>
                <option value="1" ${u.department_id === 1  ? 'selected' : ''}>Raw Materials</option>
                <option value="2" ${u.department_id === 2  ? 'selected' : ''}>Production</option>
                <option value="3" ${u.department_id === 3  ? 'selected' : ''}>Finished Goods</option>
                <option value="4" ${u.department_id === 4  ? 'selected' : ''}>Shipping</option>
                <option value="5" ${u.department_id === 5  ? 'selected' : ''}>HR &amp; Admin</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Account Status</label>
            <select id="edit-user-status" class="form-control">
              <option value="1" ${u.is_active  ? 'selected' : ''}>Active - Can log in</option>
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

    // Apply role logic based on user's current role
    this.handleRoleChange('edit');
  },

  async submitEdit(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btn-edit-user');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const deptSelect  = document.getElementById('edit-user-dept');
    const wasDisabled = deptSelect.disabled;
    deptSelect.disabled = false;

    const data = {
      role:         document.getElementById('edit-user-role').value,
      departmentId: deptSelect.value || null,
      isActive:     document.getElementById('edit-user-status').value === '1'
    };

    deptSelect.disabled = wasDisabled;

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
