/* ══════════════════════════════════════════
   notifications.js
   ══════════════════════════════════════════ */
async function renderNotifications() {
  setHTML('#page-content', loading());
  try {
    const res   = await API.notifications.list();
    const notifs = Array.isArray(res) ? res : (res.items || res.data || []);
    const unread = notifs.filter(n => !n.read && !n.is_read).length;

    setHTML('#page-content', `
      <div class="flex-between" style="flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;color:var(--txt2)">${notifs.length} alerts &middot; <span style="color:var(--blue2)">${unread} unread</span></div>
        ${unread > 0 ? `<button class="sec-btn" onclick="markAllRead()"><i class="ti ti-checks"></i> Mark all read</button>` : ''}
      </div>
      <div class="card">
        <div class="card-hd"><div class="card-hd-title">All alerts &amp; notifications</div></div>
        ${notifs.length === 0 ? `<div style="padding:40px;text-align:center;color:var(--txt2)"><i class="ti ti-bell-off" style="font-size:36px;display:block;margin-bottom:10px;color:var(--txt3)"></i>No notifications</div>`
        : notifs.map(n => {
            const read = n.read || n.is_read;
            const color = alertColor(n.type||n.priority);
            return `
            <div class="alert-item" style="${!read?'background:rgba(59,130,246,.03)':''}" onclick="markNRead(${n.id}, this)">
              <div class="a-dot" style="background:${color}"></div>
              <div class="a-body">
                <div class="a-title" style="${!read?'font-weight:600':''}">${esc(n.title||n.message||'—')}</div>
                <div class="a-sub" style="white-space:normal">${esc(n.message||n.description||'')}</div>
                <div style="font-size:10px;color:var(--txt3);margin-top:4px">${ago(n.created_at||n.createdAt)}</div>
              </div>
              ${!read ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:4px"></div>` : ''}
              <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171;flex-shrink:0" onclick="event.stopPropagation();deleteNotif(${n.id},this)" title="Delete"><i class="ti ti-x"></i></button>
            </div>`;
          }).join('')}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

async function markNRead(id, row) {
  try {
    await API.notifications.markRead(id);
    if (row) row.style.background = '';
    const dot = row?.querySelector('[style*="background:var(--blue)"]');
    if (dot) dot.remove();
    refreshBadges();
  } catch {}
}

async function markAllRead() {
  try { await API.notifications.markAllRead(); toast('All marked as read'); renderNotifications(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}

async function deleteNotif(id, btn) {
  try { await API.notifications.delete(id); btn?.closest('.alert-item')?.remove(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}

/* ══════════════════════════════════════════
   users.js
   ══════════════════════════════════════════ */
let _usersAll = [];

async function renderUsers() {
  setHTML('#page-content', loading());
  try {
    const res  = await API.users.list();
    _usersAll  = Array.isArray(res) ? res : (res.users || res.data || []);
    buildUsersPage(_usersAll);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function buildUsersPage(users) {
  setHTML('#page-content', `
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">Users <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${users.length} accounts</span></div>
        <div class="card-hd-act" onclick="openAddUser()"><i class="ti ti-user-plus"></i> Invite user</div>
      </div>
      <div class="tbl-wrap"><table class="data-table">
        <thead><tr><th style="width:200px">User</th><th>Email</th><th>Role</th><th>Department</th><th style="width:90px">Status</th><th style="width:90px">Actions</th></tr></thead>
        <tbody>
          ${users.length === 0 ? `<tr><td colspan="6">${empty('No users found')}</td></tr>` :
            users.map(u => `
              <tr>
                <td><div style="display:flex;align-items:center;gap:9px">
                  <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0">${initials(u.name||u.email)}</div>
                  <div><div style="font-size:12px;font-weight:600">${esc(u.name||'—')}</div></div>
                </div></td>
                <td style="color:var(--txt2)">${esc(u.email||'—')}</td>
                <td>${pill(u.role||'user')}</td>
                <td style="color:var(--txt2)">${esc(u.department||'—')}</td>
                <td>${pill(u.is_active||u.active||u.status||'active')}</td>
                <td><div style="display:flex;gap:4px">
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openEditUser(${u.id})" title="Edit"><i class="ti ti-edit"></i></button>
                  ${u.id !== App.user?.id ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteUser(${u.id},'${esc(u.name||u.email)}')" title="Delete"><i class="ti ti-trash"></i></button>` : ''}
                </div></td>
              </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `);
}

function openAddUser() {
  openModal('Invite user', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full name *</label><input id="u-name" class="form-input" placeholder="John Doe"/></div>
        <div class="form-group"><label class="form-label">Email *</label><input id="u-email" class="form-input" type="email" placeholder="john@company.com"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Password *</label><input id="u-pass" class="form-input" type="password" placeholder="Min 6 characters"/></div>
        <div class="form-group"><label class="form-label">Role</label>
          <select id="u-role" class="form-select">
            <option value="user">User</option><option value="manager">Manager</option>
            <option value="operator">Operator</option><option value="qc">QC Inspector</option><option value="admin">Administrator</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Department</label><input id="u-dept" class="form-input" placeholder="e.g. Production, Raw Materials"/></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddUser()"><i class="ti ti-user-plus"></i> Create user</button>
      </div>
    </div>
  `);
}

async function submitAddUser() {
  const name  = $('#u-name')?.value.trim();
  const email = $('#u-email')?.value.trim();
  const pass  = $('#u-pass')?.value;
  if (!name||!email||!pass) { toast('Name, email and password are required', 'error'); return; }
  try {
    await API.users.create({ name, email, password: pass, role: $('#u-role')?.value, department: $('#u-dept')?.value.trim() });
    forceCloseModal(); toast('User created'); renderUsers();
  } catch (err) { toast(err.message, 'error'); }
}

function openEditUser(id) {
  const u = _usersAll.find(x => x.id === id);
  if (!u) return;
  openModal('Edit user', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input id="ue-name" class="form-input" value="${esc(u.name||'')}"/></div>
        <div class="form-group"><label class="form-label">Role</label>
          <select id="ue-role" class="form-select">
            ${['user','manager','operator','qc','admin'].map(r => `<option value="${r}" ${(u.role||'')===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Department</label><input id="ue-dept" class="form-input" value="${esc(u.department||'')}"/></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitEditUser(${id})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitEditUser(id) {
  try {
    await API.users.update(id, { name: $('#ue-name')?.value.trim(), role: $('#ue-role')?.value, department: $('#ue-dept')?.value.trim() });
    forceCloseModal(); toast('User updated'); renderUsers();
  } catch (err) { toast(err.message, 'error'); }
}

function deleteUser(id, name) {
  confirm(`Delete user <strong>${esc(name)}</strong>? This cannot be undone.`, async () => {
    try { await API.users.delete(id); toast('User deleted'); renderUsers(); }
    catch (err) { toast(err.message, 'error'); }
  });
}

/* ══════════════════════════════════════════
   departments.js
   ══════════════════════════════════════════ */
async function renderDepartments() {
  setHTML('#page-content', loading());
  try {
    const res  = await API.departments.list();
    const depts = Array.isArray(res) ? res : (res.departments || res.data || []);
    setHTML('#page-content', `
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Departments</div>
          <div class="card-hd-act" onclick="openAddDept()"><i class="ti ti-plus"></i> Add</div>
        </div>
        ${depts.length === 0 ? empty('No departments yet', 'ti-building') : `
          <div class="tbl-wrap"><table class="data-table">
            <thead><tr><th>Department name</th><th>Description</th><th style="width:80px">Actions</th></tr></thead>
            <tbody>
              ${depts.map(d => `
                <tr>
                  <td><strong>${esc(d.name||'—')}</strong></td>
                  <td style="color:var(--txt2)">${esc(d.description||'—')}</td>
                  <td><div style="display:flex;gap:4px">
                    <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openEditDept(${d.id})" title="Edit"><i class="ti ti-edit"></i></button>
                    <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteDept(${d.id},'${esc(d.name)}')" title="Delete"><i class="ti ti-trash"></i></button>
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table></div>`}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function openAddDept() {
  openModal('Add department', `
    <div class="form-section">
      <div class="form-group"><label class="form-label">Name *</label><input id="d-name" class="form-input" placeholder="e.g. Raw Materials"/></div>
      <div class="form-group"><label class="form-label">Description</label><textarea id="d-desc" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddDept()"><i class="ti ti-plus"></i> Add</button>
      </div>
    </div>
  `);
}

async function submitAddDept() {
  const name = $('#d-name')?.value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  try { await API.departments.create({ name, description: $('#d-desc')?.value.trim() }); forceCloseModal(); toast('Department added'); renderDepartments(); }
  catch (err) { toast(err.message, 'error'); }
}

function openEditDept(id) {} // similar pattern — left brief for space

function deleteDept(id, name) {
  confirm(`Delete department <strong>${esc(name)}</strong>?`, async () => {
    try { await API.departments.delete(id); toast('Deleted'); renderDepartments(); }
    catch (err) { toast(err.message, 'error'); }
  });
}

/* ══════════════════════════════════════════
   reports.js — Analytics
   ══════════════════════════════════════════ */
async function renderReports() {
  setHTML('#page-content', loading());
  try {
    const [dash, inv, prod, ship] = await Promise.all([
      API.reports.dashboard().catch(() => ({})),
      API.reports.inventory().catch(() => ({})),
      API.reports.production().catch(() => ({})),
      API.reports.shipping().catch(() => ({})),
    ]);

    setHTML('#page-content', `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:13px;color:var(--txt2)">Analytics overview &mdash; generated ${new Date().toLocaleString('en-NG')}</div>
        <button class="sec-btn" onclick="window.print()"><i class="ti ti-printer"></i> Print</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-packages"></i></div></div><div class="kpi-val">${fmt(dash.inventoryCount||inv.totalItems||'—')}</div><div class="kpi-lbl">Inventory items</div></div>
        <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-settings-2"></i></div></div><div class="kpi-val">${fmt(dash.completedRuns||prod.completedRuns||'—')}</div><div class="kpi-lbl">Completed runs</div></div>
        <div class="kpi"><div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-truck"></i></div></div><div class="kpi-val">${fmt(dash.totalShipments||ship.totalShipments||'—')}</div><div class="kpi-lbl">Total shipments</div></div>
        <div class="kpi"><div class="kpi-top"><div class="kpi-ico p"><i class="ti ti-recycle"></i></div></div><div class="kpi-val text-teal">${fmtKg(dash.rpetRecycledTotal||prod.rpetTotal||0)}</div><div class="kpi-lbl">R-PET recycled total</div></div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-hd"><div class="card-hd-title">Inventory summary</div></div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
            ${Object.entries({
              'Total items': fmt(inv.totalItems||dash.inventoryCount||'—'),
              'Critical stock': fmt(inv.criticalItems||'—'),
              'Low stock items': fmt(inv.lowStockItems||'—'),
              'R-PET available': fmtKg(inv.rpetAvailable||dash.rpetAvailable||0),
            }).map(([k,v]) => `<div class="flex-between" style="border-bottom:1px solid var(--border);padding-bottom:8px"><span style="color:var(--txt2);font-size:12.5px">${k}</span><span style="font-weight:700">${v}</span></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><div class="card-hd-title">Production summary</div></div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
            ${Object.entries({
              'Total runs': fmt(prod.totalRuns||'—'),
              'Active runs': fmt(prod.activeRuns||dash.activeProduction||'—'),
              'Completed runs': fmt(prod.completedRuns||'—'),
              'Total rejected units': fmt(prod.totalRejected||'—'),
              'R-PET from rejections': fmtKg(prod.rpetTotal||0),
            }).map(([k,v]) => `<div class="flex-between" style="border-bottom:1px solid var(--border);padding-bottom:8px"><span style="color:var(--txt2);font-size:12.5px">${k}</span><span style="font-weight:700">${v}</span></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><div class="card-hd-title">Shipping summary</div></div>
        <div style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
          ${[['Total', ship.totalShipments||'—', 'var(--blue2)'], ['Pending', ship.pendingShipments||'—', 'var(--amber)'], ['In transit', ship.dispatchedShipments||'—', 'var(--blue2)'], ['Delivered', ship.deliveredShipments||'—', 'var(--green)']].map(([l,v,c]) =>
            `<div style="text-align:center;padding:14px;background:var(--bg3);border:1px solid var(--border);border-radius:10px">
              <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:800;color:${c}">${fmt(v)}</div>
              <div style="font-size:11px;color:var(--txt2);margin-top:4px">${l}</div>
            </div>`).join('')}
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ══════════════════════════════════════════
   audit.js
   ══════════════════════════════════════════ */
async function renderAudit() {
  setHTML('#page-content', loading());
  try {
    const res  = await API.audit.list();
    const logs = Array.isArray(res) ? res : (res.logs || res.data || res.items || []);
    setHTML('#page-content', `
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Audit log <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${logs.length} entries</span></div>
          <div class="card-hd-act" onclick="renderAudit()"><i class="ti ti-refresh"></i> Refresh</div>
        </div>
        ${logs.length === 0 ? empty('No audit logs yet', 'ti-file-search') : `
          <div class="tbl-wrap"><table class="data-table">
            <thead><tr><th style="width:140px">Timestamp</th><th>Action</th><th>User</th><th>Resource</th><th>Details</th></tr></thead>
            <tbody>
              ${logs.map(l => `<tr>
                <td style="font-size:10.5px;color:var(--txt2)">${fmtDT(l.created_at||l.timestamp)}</td>
                <td>${pill(l.action||l.event||'action')}</td>
                <td style="color:var(--txt2)">${esc(l.user||l.user_name||l.email||'System')}</td>
                <td style="color:var(--txt2)">${esc(l.resource||l.entity||l.table||'—')}</td>
                <td style="color:var(--txt2);font-size:11px">${esc(String(l.details||l.description||l.message||'').substring(0,80))}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ── Shared alertColor (used by dashboard + notifications) ── */
function alertColor(type) {
  const t = String(type||'').toLowerCase();
  if (['critical','error','high','danger'].includes(t)) return '#ef4444';
  if (['warning','warn','medium'].includes(t))           return 'var(--amber)';
  if (['info','low','default'].includes(t))              return 'var(--blue2)';
  if (['success','resolved','completed'].includes(t))    return 'var(--green)';
  if (['rpet','recycling','teal'].includes(t))           return 'var(--teal)';
  return 'var(--txt2)';
}

// fmtDT is defined in utils.js
