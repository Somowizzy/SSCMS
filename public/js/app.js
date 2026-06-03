/* ── App state ──────────────────────────────────────────── */
const App = {
  user: null,
  page: null,
  CTA: {
    dashboard:      { label:'New Request',    icon:'ti-plus' },
    'rm-dash':      { label:'Raise GRN',      icon:'ti-truck-loading' },
    'rm-inventory': { label:'Add Material',   icon:'ti-plus' },
    'rm-receiving': { label:'Raise GRN',      icon:'ti-truck-loading' },
    'rm-warehouse': { label:'Refresh',        icon:'ti-refresh' },
    'prod-dash':       { label:'New Work Order', icon:'ti-plus' },
    'prod-machines':   { label:'Refresh',        icon:'ti-refresh' },
    'prod-schedule':   { label:'This Week',      icon:'ti-calendar' },
    'prod-workorders': { label:'New Work Order', icon:'ti-plus' },
    'fg-dash':       { label:'Add FG Batch',  icon:'ti-plus' },
    'fg-inventory':  { label:'Add FG Batch',  icon:'ti-plus' },
    'fg-qc':         { label:'Log QC',        icon:'ti-microscope' },
    'fg-storage':    { label:'Refresh',       icon:'ti-refresh' },
    'raw-materials':{ label:'Log Receiving',  icon:'ti-arrow-down-left' },
    inventory:      { label:'Add Material',   icon:'ti-plus' },
    schedule:       { label:'This Week',      icon:'ti-calendar' },
    forecast:       { label:'Refresh',        icon:'ti-refresh' },
    suppliers:      { label:'Add Supplier',   icon:'ti-plus' },
    settings:       { label:'Save All',       icon:'ti-check' },
    production:     { label:'New Run',        icon:'ti-plus' },
    'finished-goods':{ label:'Add FG',        icon:'ti-plus' },
    shipping:       { label:'New Shipment',   icon:'ti-truck' },
    requests:       { label:'New Request',    icon:'ti-plus' },
    notifications:  { label:'Mark all read',  icon:'ti-checks' },
    users:          { label:'Invite User',    icon:'ti-user-plus' },
    departments:    { label:'Add Dept.',      icon:'ti-plus' },
    reports:        { label:'Export',         icon:'ti-download' },
    audit:          { label:'Refresh',        icon:'ti-refresh' },
  },
  TITLES: {
    dashboard:'Dashboard', 'raw-materials':'Raw Materials Department', inventory:'Stock & Inventory',
    'rm-dash':'Raw Materials · Dashboard', 'rm-inventory':'Material Inventory',
    'rm-receiving':'Receiving / GRN', 'rm-warehouse':'Warehouse Zones',
    'prod-dash':'Production · Dashboard', 'prod-machines':'Machine Operations',
    'prod-schedule':'Production Schedule', 'prod-workorders':'Work Orders',
    'fg-dash':'Finished Goods · Dashboard', 'fg-inventory':'FG Inventory',
    'fg-qc':'Quality Control', 'fg-storage':'FG Storage',
    schedule:'Production Schedule', forecast:'AI Demand Forecast', suppliers:'Suppliers', settings:'Settings',
    production:'Production Management', 'finished-goods':'Finished Goods',
    shipping:'Shipping & Dispatch', requests:'Orders & Requests',
    notifications:'Alerts & Notifications', users:'User Management',
    departments:'Departments', reports:'Analytics & Reports', audit:'Audit Log',
  },
};

/* ── Page registry ──────────────────────────────────────── */
// Arrow wrappers ensure functions are resolved at call time, not at parse time
// (the render* functions are defined in scripts loaded after this file)
const Pages = {
  dashboard:       () => renderDashboard(),
  'raw-materials': () => renderRawMaterials(),
  'rm-dash':       () => renderRmDash(),
  'rm-inventory':  () => renderRmInventory(),
  'rm-receiving':  () => renderRmReceiving(),
  'rm-warehouse':  () => renderRmWarehouse(),
  'prod-dash':       () => renderProdDash(),
  'prod-machines':   () => renderProdMachines(),
  'prod-schedule':   () => renderProdSchedule(),
  'prod-workorders': () => renderProdWorkorders(),
  'fg-dash':       () => renderFgDash(),
  'fg-inventory':  () => renderFgInventory(),
  'fg-qc':         () => renderFgQc(),
  'fg-storage':    () => renderFgStorage(),
  inventory:       () => renderInventory(),
  schedule:        () => renderSchedule(),
  forecast:        () => renderForecast(),
  suppliers:       () => renderSuppliers(),
  settings:        () => renderSettings(),
  production:      () => renderProduction(),
  'finished-goods':() => renderFinishedGoods(),
  shipping:        () => renderShipping(),
  requests:        () => renderRequests(),
  notifications:   () => renderNotifications(),
  users:           () => renderUsers(),
  departments:     () => renderDepartments(),
  reports:         () => renderReports(),
  audit:           () => renderAudit(),
};

/* ── Boot ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('sscms:logout', showLogin);

  // Sidebar nav clicks
  $$('#sidebar-nav .sb-item').forEach(item => {
    item.addEventListener('click', () => goTo(item.dataset.page));
  });

  // Search
  const searchInput = $('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      if (window._pageSearch) window._pageSearch(e.target.value);
    }, 300));
  }

  try {
    const res = await API.auth.me();
    App.user = res.user || res;
    showApp();
    await refreshBadges();
    goTo(landingPage());
    setInterval(refreshBadges, 60000); // refresh badges every 60s
  } catch {
    showLogin();
  }
});

/* ── Auth ───────────────────────────────────────────────── */
function showLogin() {
  App.user = null;
  $('#app-shell').style.display = 'none';
  $('#login-screen').style.display = 'flex';
}

function canManage() {
  return ['hr_admin', 'system_admin', 'dept_head'].includes(App.user?.role);
}

function isAdmin() {
  return ['hr_admin', 'system_admin'].includes(App.user?.role);
}

/* Which page to land on after sign-in.
   Admins → Dashboard. Department members → their department page (once it
   exists). Add new mappings here as each department dashboard is built. */
function landingPage() {
  if (isAdmin()) return 'dashboard';
  const did = Number(App.user?.departmentId ?? App.user?.department_id);
  const byDept = {
    1: 'rm-dash',          // Raw Materials portal
    2: 'prod-dash',        // Production portal
    3: 'fg-dash',          // Finished Goods portal
    // 4: 'ship-dash',     // Shipping portal (next)
  };
  return byDept[did] || 'dashboard';
}

/* Sidebar visibility per department.
   Each entry lists the pages a member of that department should see in
   the sidebar. Admins always see everything. */
const NAV_VISIBILITY_BY_DEPT = {
  // Raw Materials dept members see only the RM portal (4 pages) + Alerts + Audit Log.
  // Cross-departmental updates still flow into these pages through the shared API.
  1: ['rm-dash', 'rm-inventory', 'rm-receiving', 'rm-warehouse', 'notifications', 'audit'],
  // Production dept members see only the Production portal pages + Alerts + Audit Log.
  2: ['prod-dash', 'prod-machines', 'prod-schedule', 'prod-workorders', 'notifications', 'audit'],
  // Finished Goods dept members see only the FG portal pages + Alerts + Audit Log.
  3: ['fg-dash', 'fg-inventory', 'fg-qc', 'fg-storage', 'notifications', 'audit'],
  // 4 (Shipping), 5 (HR & Admin) — to be replaced when each portal lands.
};

/* Apply department-scoped sidebar visibility. Hides items not in the user's
   department list and collapses section labels that end up empty. */
function applyDeptVisibility() {
  const nav = $('#sidebar-nav');
  if (!nav) return;

  // Admins and HR & Administration (dept 5) see every nav item.
  const did = Number(App.user?.departmentId ?? App.user?.department_id);
  if (isAdmin() || did === 5) return;

  const allowed = NAV_VISIBILITY_BY_DEPT[did];
  if (!allowed) return; // unknown dept → leave default visibility
  const visible = new Set(allowed);

  // Hide individual nav items not in the visible set (skip admin-gated rows)
  $$('#sidebar-nav .sb-item').forEach(item => {
    if (item.classList.contains('sb-admin')) return; // already handled
    const page = item.dataset.page;
    if (page && !visible.has(page)) item.style.display = 'none';
  });

  // Hide section labels with no visible items beneath them
  const children = Array.from(nav.children);
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (!el.classList.contains('sb-lbl')) continue;
    if (el.classList.contains('sb-admin')) continue;
    let anyVisible = false;
    for (let j = i + 1; j < children.length; j++) {
      const next = children[j];
      if (next.classList.contains('sb-lbl')) break;
      if (next.classList.contains('sb-item') && next.style.display !== 'none') {
        anyVisible = true; break;
      }
    }
    if (!anyVisible) el.style.display = 'none';
  }
}

function showApp() {
  $('#login-screen').style.display = 'none';
  $('#app-shell').style.display = 'flex';
  // user card
  const name = App.user?.name
    || [App.user?.first_name || App.user?.firstName, App.user?.last_name || App.user?.lastName].filter(Boolean).join(' ')
    || App.user?.email || 'User';
  const role = App.user?.role || App.user?.department || '—';
  setText('#user-name', name);
  setText('#user-role', role);
  setText('#user-avatar', initials(name));
  // HR & Administration personnel (dept 5) see the full interface, same as
  // hr_admin / system_admin roles. Other dept members get a scoped view.
  const userDeptId = Number(App.user?.departmentId ?? App.user?.department_id);
  const seesAll = isAdmin() || userDeptId === 5;
  // admin nav (Users, Departments)
  $$('.sb-admin').forEach(e => e.style.display = seesAll ? '' : 'none');
  // Raw Materials nav (the old HR cross-dept view of RM)
  const showRM = seesAll || userDeptId === 1;
  $$('.sb-rawmat').forEach(e => e.style.display = showRM ? '' : 'none');
  // Raw Materials portal items (visible ONLY to dept-1 non-admin members)
  const showRmPortal = (!isAdmin() && userDeptId === 1);
  $$('.sb-rmportal').forEach(e => e.style.display = showRmPortal ? '' : 'none');
  // Production portal items (visible ONLY to dept-2 non-admin members)
  const showProdPortal = (!isAdmin() && userDeptId === 2);
  $$('.sb-prodportal').forEach(e => e.style.display = showProdPortal ? '' : 'none');
  // Finished Goods portal items (visible ONLY to dept-3 non-admin members)
  const showFgPortal = (!isAdmin() && userDeptId === 3);
  $$('.sb-fgportal').forEach(e => e.style.display = showFgPortal ? '' : 'none');
  // HR / admin-only items (Schedule, Suppliers, AI Forecast, Settings…)
  $$('.sb-hronly').forEach(e => e.style.display = seesAll ? '' : 'none');
  // Apply department-scoped sidebar visibility (hides items not in this
  // department's allow-list, and collapses empty section labels).
  applyDeptVisibility();
  // hide CTA for view-only dept_user (except Raw Materials user, who can still log receiving)
  const ctaBtn = $('#cta-btn');
  if (ctaBtn) ctaBtn.style.display = canManage() ? '' : 'none';
}

/* ── Navigation ─────────────────────────────────────────── */
function goTo(page) {
  if (!Pages[page]) page = 'dashboard';
  // Route guard: non-admin dept members can only navigate to pages in
  // their allow-list. Anything else bounces back to their dept landing.
  // Default-deny if there's no user / unknown dept so a logged-out call
  // can't accidentally render dept pages.
  if (!isAdmin()) {
    const did = Number(App.user?.departmentId ?? App.user?.department_id);
    if (!App.user) {
      // No session — let the boot flow handle the login redirect.
      return;
    }
    const allowed = NAV_VISIBILITY_BY_DEPT[did];
    if (allowed && did !== 5 && !allowed.includes(page)) {
      page = landingPage();
    } else if (!allowed && did !== 5) {
      // Unknown dept and not HR/admin → bounce to landing (likely a stale token)
      page = landingPage();
    }
  }
  App.page = page;
  window._pageSearch = null; // reset search handler

  // sidebar active
  $$('#sidebar-nav .sb-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));

  // topbar
  setText('#page-title', App.TITLES[page] || page);
  const cta = App.CTA[page] || { label:'New', icon:'ti-plus' };
  setText('#cta-label', cta.label);
  $('#cta-icon').className = `ti ${cta.icon}`;
  // CTA visibility: hidden for view-only dept_user, but always shown on Raw Materials
  // (Log Receiving is a permitted action for dept_user in that department).
  const ctaBtn = $('#cta-btn');
  if (ctaBtn) ctaBtn.style.display = (canManage() || page === 'raw-materials') ? '' : 'none';

  // clear search
  const si = $('#search-input');
  if (si) si.value = '';

  // show loading
  setHTML('#page-content', loading());

  // render
  try { Pages[page](); }
  catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>Error: ${esc(err.message)}</p></div>`);
  }
}

/* ── CTA button ─────────────────────────────────────────── */
function pageCTA() {
  const handlers = {
    dashboard:        () => goTo('requests'),
    'raw-materials':  () => typeof openRMReceiving     === 'function' && openRMReceiving(),
    'rm-dash':        () => typeof openRmGRN           === 'function' && openRmGRN(),
    'rm-inventory':   () => typeof openRmAddMaterial   === 'function' && openRmAddMaterial(),
    'rm-receiving':   () => typeof openRmGRN           === 'function' && openRmGRN(),
    'rm-warehouse':   () => refreshPage(),
    'prod-dash':       () => typeof openAddProduction === 'function' && openAddProduction(),
    'prod-machines':   () => refreshPage(),
    'prod-schedule':   () => refreshPage(),
    'prod-workorders': () => typeof openAddProduction === 'function' && openAddProduction(),
    'fg-dash':       () => typeof openFgAddEntry === 'function' && openFgAddEntry(),
    'fg-inventory':  () => typeof openFgAddEntry === 'function' && openFgAddEntry(),
    'fg-qc':         () => refreshPage(),
    'fg-storage':    () => refreshPage(),
    inventory:        () => typeof openAddInventory    === 'function' && openAddInventory(),
    schedule:         () => typeof schThisWeek         === 'function' && schThisWeek(),
    forecast:         () => refreshPage(),
    suppliers:        () => typeof openSupplierModal   === 'function' && openSupplierModal(),
    settings:         () => typeof settingsSaveAll     === 'function' && settingsSaveAll(),
    production:       () => typeof openAddProduction   === 'function' && openAddProduction(),
    'finished-goods': () => typeof openAddFG           === 'function' && openAddFG(),
    shipping:         () => typeof openAddShipping     === 'function' && openAddShipping(),
    requests:         () => typeof openAddRequest      === 'function' && openAddRequest(),
    notifications:    () => typeof markAllRead         === 'function' && markAllRead(),
    users:            () => typeof openAddUser         === 'function' && openAddUser(),
    departments:      () => typeof openAddDept         === 'function' && openAddDept(),
    reports:          () => window.print(),
    audit:            () => refreshPage(),
  };
  handlers[App.page]?.();
}

/* ── Refresh ────────────────────────────────────────────── */
function refreshPage() {
  const icon = $('#refresh-icon');
  icon?.classList.add('spin');
  goTo(App.page);
  setTimeout(() => icon?.classList.remove('spin'), 800);
}

/* ── Theme toggle ───────────────────────────────────────── */
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  const icon = $('#theme-icon');
  if (icon) icon.className = next === 'light' ? 'ti ti-moon' : 'ti ti-sun';
  try { localStorage.setItem('sscms-theme', next); } catch {}
}

(function initTheme() {
  try {
    const saved = localStorage.getItem('sscms-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.addEventListener('DOMContentLoaded', () => {
        const icon = $('#theme-icon');
        if (icon) icon.className = 'ti ti-moon';
      });
    }
  } catch {}
})();

/* ── Badges ─────────────────────────────────────────────── */
async function refreshBadges() {
  try {
    const [notif, reqs] = await Promise.all([
      API.notifications.unread().catch(() => null),
      API.requests.list('?status=pending').catch(() => null),
    ]);
    const nc = notif?.count ?? (Array.isArray(notif) ? notif.length : 0);
    const rc = Array.isArray(reqs) ? reqs.length : (reqs?.count ?? 0);
    const nb = $('#badge-notif');
    const rb = $('#badge-requests');
    const pip = $('#notif-pip');
    if (nb) nb.textContent = nc > 0 ? nc : '';
    if (rb) rb.textContent = rc > 0 ? rc : '';
    if (pip) pip.style.display = nc > 0 ? '' : 'none';
  } catch {}
}
