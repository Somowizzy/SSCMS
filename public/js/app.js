/* ── App state ──────────────────────────────────────────── */
const App = {
  user: null,
  page: null,
  CTA: {
    dashboard:      { label:'New Request',    icon:'ti-plus' },
    'raw-materials':{ label:'Log Receiving',  icon:'ti-arrow-down-left' },
    inventory:      { label:'Add Material',   icon:'ti-plus' },
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
  inventory:       () => renderInventory(),
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
    goTo('dashboard');
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
  // admin nav
  $$('.sb-admin').forEach(e => e.style.display = isAdmin() ? '' : 'none');
  // Raw Materials nav — only visible to admins and members of dept 1
  const userDeptId = Number(App.user?.departmentId ?? App.user?.department_id);
  const showRM = isAdmin() || userDeptId === 1;
  $$('.sb-rawmat').forEach(e => e.style.display = showRM ? '' : 'none');
  // hide CTA for view-only dept_user (except Raw Materials user, who can still log receiving)
  const ctaBtn = $('#cta-btn');
  if (ctaBtn) ctaBtn.style.display = canManage() ? '' : 'none';
}

/* ── Navigation ─────────────────────────────────────────── */
function goTo(page) {
  if (!Pages[page]) page = 'dashboard';
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
    inventory:        () => typeof openAddInventory    === 'function' && openAddInventory(),
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
