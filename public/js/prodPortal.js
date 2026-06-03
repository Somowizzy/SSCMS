/* ══════════════════════════════════════════════════════════════
   prodPortal.js — Production Department Portal
   ══════════════════════════════════════════════════════════════
   Per-dept-2 (Production) view. Four sub-pages:
     - prod-dash        (dashboard)
     - prod-machines    (machine grid with live status)
     - prod-schedule    (5-day Gantt of work orders)
     - prod-workorders  (full work-order table)
   All wired to the shared backend (/api/production, /api/inventory,
   /api/requests) so cross-departmental updates flow through.
*/

let _prodpJobs = [];
let _prodpReqs = [];
let _prodpInv  = [];

async function _prodpLoad() {
  const [jobs, reqs, inv] = await Promise.all([
    API.production.list().catch(() => ({ jobs: [] })),
    API.requests.list().catch(() => ({ requests: [] })),
    API.inventory.list().catch(() => ({ items: [] })),
  ]);
  _prodpJobs = Array.isArray(jobs) ? jobs : (jobs.jobs || []);
  // Requests RELEVANT to Production = ones routed FROM production OR TO production
  const allReqs = Array.isArray(reqs) ? reqs : (reqs.requests || []);
  _prodpReqs = allReqs.filter(r => Number(r.department_id) === 2 || Number(r.target_department_id) === 2);
  _prodpInv  = Array.isArray(inv) ? inv : (inv.items || []);
}

/* ── Helpers ──────────────────────────────────────────────── */
function _prodpToday(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(d)) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return d.getTime() >= t.getTime() && d.getTime() < t.getTime() + 86400000;
}
function _prodpStatusPill(status) {
  const s = (status || '').toLowerCase();
  if (s === 'in_progress' || s === 'in-progress' || s === 'active' || s === 'running') return { cls: 'b', label: 'In Progress' };
  if (s === 'completed')                                                                return { cls: 'g', label: 'Completed' };
  if (s === 'cancelled' || s === 'rejected')                                            return { cls: 'r', label: 'Cancelled' };
  if (s === 'paused' || s === 'on_hold')                                                return { cls: 'r', label: 'On Hold' };
  if (s === 'scheduled')                                                                 return { cls: 'gr', label: 'Scheduled' };
  return { cls: 'gr', label: status || 'Unknown' };
}

/* ═══════════════════════════════════════════
   PAGE 1: prod-dash
   ═══════════════════════════════════════════ */
async function renderProdDash() {
  setHTML('#page-content', loading());
  try {
    await _prodpLoad();

    const allMachines = (typeof PROD_MACHINE_META !== 'undefined' ? Object.keys(PROD_MACHINE_META) : ['Husky P1','Husky P2','Husky P3','Husky P4','Husky P5','Husky P6','SACMI S1','SACMI S2','IPS']);
    const totalMachines = allMachines.length;
    const runningJobs = _prodpJobs.filter(j => ['in_progress','active','running'].includes((j.status || '').toLowerCase()));
    const activeMachines = new Set(runningJobs.map(j => j.machine).filter(Boolean));
    const unitsToday = _prodpJobs
      .filter(j => _prodpToday(j.updated_at || j.created_at))
      .reduce((s, j) => s + Number(j.quantity_completed || 0), 0);
    const totalCompleted = _prodpJobs.reduce((s, j) => s + Number(j.quantity_completed || 0), 0);
    const totalDefects   = _prodpJobs.reduce((s, j) => s + Number(j.defects || 0), 0);
    const defectRate     = totalCompleted > 0 ? (totalDefects / totalCompleted) * 100 : 0;
    const utilization    = (activeMachines.size / Math.max(totalMachines, 1)) * 100;

    const h = new Date().getHours();
    const period = (typeof greeting === 'function' ? greeting() : (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'));
    const firstName = App.user?.firstName || App.user?.first_name || App.user?.name || 'there';
    const dateStr = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Active work orders (most recent first)
    const activeWO = _prodpJobs
      .filter(j => !['cancelled','completed'].includes((j.status || '').toLowerCase()))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 4);

    // Machine status rows — top 6 with most recent activity
    const machineRows = allMachines.map(m => {
      const activeJob = _prodpJobs.find(j => j.machine === m && ['in_progress','active','running'].includes((j.status || '').toLowerCase()));
      const allOnM   = _prodpJobs.filter(j => j.machine === m);
      const oee = activeJob && activeJob.quantity_requested
        ? Math.min(100, Math.round((Number(activeJob.quantity_completed || 0) / Number(activeJob.quantity_requested)) * 100))
        : (allOnM.length ? 0 : null);
      return { machine: m, product: activeJob?.product_name || '—', oee, running: !!activeJob };
    }).slice(0, 6);

    setHTML('#page-content', `
      <div style="font-size:14px;color:var(--txt2);margin-bottom:2px">
        Good ${period}, <strong style="color:var(--txt)">${esc(firstName)}</strong> &mdash; ${dateStr}
      </div>

      <div class="kpi-grid">
        <div class="kpi" onclick="goTo('prod-machines')">
          <div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-settings-2"></i></div><span class="kpi-delta up">${activeMachines.size > 0 ? '+' + activeMachines.size : 'idle'}</span></div>
          <div class="kpi-val">${activeMachines.size} / ${totalMachines}</div>
          <div class="kpi-lbl">Active Production Lines</div>
        </div>
        <div class="kpi" onclick="goTo('prod-workorders')">
          <div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-package"></i></div><span class="kpi-delta up">Today</span></div>
          <div class="kpi-val">${fmt(unitsToday)}</div>
          <div class="kpi-lbl">Units Output Today</div>
        </div>
        <div class="kpi" onclick="goTo('prod-machines')">
          <div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-cpu"></i></div><span class="kpi-delta up">+0%</span></div>
          <div class="kpi-val">${utilization.toFixed(1)}%</div>
          <div class="kpi-lbl">Machine Utilization</div>
        </div>
        <div class="kpi" onclick="goTo('prod-workorders')">
          <div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-microscope"></i></div><span class="kpi-delta ${defectRate > 2 ? 'dn' : 'up'}">${defectRate > 2 ? '⚠' : '✓'}</span></div>
          <div class="kpi-val">${defectRate.toFixed(2)}%</div>
          <div class="kpi-lbl">Defect Rate</div>
        </div>
      </div>

      <div class="two-col">
        <!-- Machine Status -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Machine Status</div>
            <span class="card-hd-act" onclick="goTo('prod-machines')">Full view &rarr;</span>
          </div>
          <div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Machine</th><th>Product</th><th>OEE</th><th>Status</th></tr></thead>
            <tbody>
              ${machineRows.map(r => {
                const oeeColor = r.oee == null ? 'var(--txt3)' : r.oee >= 80 ? 'var(--green)' : r.oee >= 50 ? 'var(--amber)' : '#f87171';
                return `<tr>
                  <td><strong>${esc(r.machine)}</strong></td>
                  <td style="color:var(--txt2)">${esc(r.product)}</td>
                  <td><span style="color:${oeeColor};font-weight:700">${r.oee == null ? '—' : r.oee + '%'}</span></td>
                  <td><span class="mc-status ${r.running ? 'run' : 'maint'}">${r.running ? 'Running' : 'Idle'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
        </div>

        <!-- Active Work Orders -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Active Work Orders</div>
            <span class="card-hd-act" onclick="goTo('prod-workorders')">View all &rarr;</span>
          </div>
          ${activeWO.length === 0
            ? `<div class="empty-state"><i class="ti ti-clipboard-check"></i><p>No active work orders</p></div>`
            : activeWO.map(j => {
                const target   = Number(j.quantity_requested || 0);
                const produced = Number(j.quantity_completed || 0);
                const pct      = target ? Math.round((produced / target) * 100) : 0;
                const pill     = _prodpStatusPill(j.status);
                return `<div class="feed-item">
                  <div class="feed-dot" style="background:var(--blue2)"></div>
                  <div class="feed-body">
                    <div class="feed-title">WO-${esc(String(j.id).padStart(4,'0'))} &middot; ${esc(j.product_name || '—')}</div>
                    <div class="feed-sub">${fmt(target)} units &middot; ${esc(j.machine || 'unassigned')}</div>
                    <div style="margin-top:6px"><div class="prog"><div class="prog-f" style="width:${pct}%;background:var(--blue2)"></div></div></div>
                    <div style="font-size:10px;color:var(--txt3);margin-top:3px">${pct}% complete &middot; ${fmt(produced)} / ${fmt(target)}</div>
                  </div>
                  <span class="pill ${pill.cls}">${pill.label}</span>
                </div>`;
              }).join('')}
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ═══════════════════════════════════════════
   PAGE 2: prod-machines
   ═══════════════════════════════════════════ */
async function renderProdMachines() {
  setHTML('#page-content', loading());
  try {
    await _prodpLoad();
    const machineList = (typeof PROD_MACHINE_META !== 'undefined' ? Object.entries(PROD_MACHINE_META) : []);

    // Group jobs by machine
    const byMachine = {};
    machineList.forEach(([m]) => { byMachine[m] = { active: null, lastJob: null, todayUnits: 0 }; });
    _prodpJobs.forEach(j => {
      const m = j.machine; if (!byMachine[m]) return;
      const status = (j.status || '').toLowerCase();
      if (['in_progress','active','running'].includes(status)) byMachine[m].active = j;
      const t = new Date(j.updated_at || j.created_at || 0).getTime();
      if (!byMachine[m].lastJob || t > new Date(byMachine[m].lastJob.updated_at || byMachine[m].lastJob.created_at || 0).getTime()) byMachine[m].lastJob = j;
      if (_prodpToday(j.updated_at || j.created_at)) byMachine[m].todayUnits += Number(j.quantity_completed || 0);
    });

    // Detect idle machines for the info banner (no activity in 7+ days)
    const idleAlerts = machineList.filter(([m]) => {
      const last = byMachine[m].lastJob;
      if (!last) return true;
      const d = (Date.now() - new Date(last.updated_at || last.created_at || 0).getTime()) / 86400000;
      return d > 7;
    });

    setHTML('#page-content', `
      ${idleAlerts.length > 0 ? `
      <div class="info-banner blue" style="display:flex;align-items:flex-start;gap:12px;border-radius:10px;padding:13px 16px;font-size:12px;line-height:1.6;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);color:var(--blue2)">
        <i class="ti ti-info-circle" style="font-size:18px;flex-shrink:0;margin-top:1px"></i>
        <div><strong>${idleAlerts.length} machine${idleAlerts.length > 1 ? 's' : ''}</strong> idle for over 7 days: ${idleAlerts.slice(0, 4).map(([m]) => esc(m)).join(', ')}${idleAlerts.length > 4 ? '…' : ''}. Review the schedule to bring them online.</div>
      </div>` : ''}

      <div class="machine-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${machineList.map(([m, meta]) => _prodpMachineCard(m, meta, byMachine[m])).join('')}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _prodpMachineCard(name, meta, state) {
  let statusCls = 'maint', statusLabel = 'Idle';
  let borderCls = '';
  if (state.active) { statusCls = 'run'; statusLabel = 'Running'; }
  else if (state.lastJob && (Date.now() - new Date(state.lastJob.updated_at || state.lastJob.created_at || 0).getTime()) / 86400000 > 7) {
    statusCls = 'down'; statusLabel = 'Offline'; borderCls = 'down-c';
  } else if (!state.lastJob) {
    statusCls = 'down'; statusLabel = 'Offline'; borderCls = 'down-c';
  }

  const active = state.active;
  const target   = active ? Number(active.quantity_requested || 0) : 0;
  const produced = active ? Number(active.quantity_completed || 0) : 0;
  const oee = target ? Math.min(100, Math.round((produced / target) * 100)) : 0;

  return `<div class="mc ${borderCls}">
    <div class="mc-top">
      <div>
        <div class="mc-name">${esc(name)}</div>
        <div class="mc-type">${esc(meta.type)}</div>
      </div>
      <span class="mc-status ${statusCls}">${statusLabel}</span>
    </div>
    <div class="mc-body">
      ${active ? `
        <div class="mc-row"><span class="mc-lbl">Current Product</span><span class="mc-val">${esc(active.product_name || '—')}</span></div>
        <div class="mc-row"><span class="mc-lbl">OEE</span><span class="mc-val ${oee >= 80 ? 'hi' : oee >= 50 ? 'wa' : 'ba'}">${oee}%</span></div>
        <div class="mc-row"><span class="mc-lbl">Target</span><span class="mc-val">${fmt(target)} units</span></div>
        <div class="mc-row"><span class="mc-lbl">Produced</span><span class="mc-val">${fmt(produced)} units</span></div>
        <div class="mc-row"><span class="mc-lbl">WO ref</span><span class="mc-val mono">WO-${esc(String(active.id).padStart(4,'0'))}</span></div>
      ` : `
        <div class="mc-row"><span class="mc-lbl">Active WO</span><span class="mc-val" style="color:var(--txt3)">None</span></div>
        <div class="mc-row"><span class="mc-lbl">Last activity</span><span class="mc-val">${state.lastJob ? ago(state.lastJob.updated_at || state.lastJob.created_at) : 'never'}</span></div>
        <div class="mc-row"><span class="mc-lbl">Today output</span><span class="mc-val">${fmt(state.todayUnits)} units</span></div>
      `}
    </div>
    <div class="mc-foot">
      <span class="mc-foot-lbl">${active ? 'WO-' + String(active.id).padStart(4,'0') : (state.lastJob ? 'Last: WO-' + String(state.lastJob.id).padStart(4,'0') : 'Idle')}</span>
      <span class="mc-foot-val" style="color:${statusCls === 'run' ? 'var(--green)' : statusCls === 'down' ? '#f87171' : 'var(--txt2)'}">${statusCls === 'run' ? 'On Track' : statusLabel}</span>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════
   PAGE 3: prod-schedule
   ═══════════════════════════════════════════ */
async function renderProdSchedule() {
  setHTML('#page-content', loading());
  try {
    await _prodpLoad();
    const machineList = (typeof PROD_MACHINE_META !== 'undefined' ? Object.keys(PROD_MACHINE_META) : []);

    // 5-day window starting Monday of this week
    const start = new Date(); start.setHours(0,0,0,0);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d;
    });
    const endMs = days[4].getTime() + 86400000;
    const todayIdx = days.findIndex(d => d.toDateString() === new Date().toDateString());

    setHTML('#page-content', `
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Production Schedule · Week of ${days[0].toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2)"><span style="width:12px;height:8px;border-radius:3px;background:rgba(59,130,246,.75);display:inline-block"></span>Preform</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2)"><span style="width:12px;height:8px;border-radius:3px;background:rgba(20,184,166,.7);display:inline-block"></span>Cap</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2)"><span style="width:12px;height:8px;border-radius:3px;background:rgba(167,139,250,.65);display:inline-block"></span>Other</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--txt2)"><span style="width:12px;height:8px;border-radius:3px;background:rgba(122,133,153,.25);display:inline-block"></span>Idle</span>
          </div>
        </div>
        <div class="gantt-wrap" style="overflow-x:auto">
          <div class="gantt-head" style="display:flex;border-bottom:1px solid var(--border)">
            <div class="gantt-label-col" style="width:140px;flex-shrink:0;padding:10px 14px;font-size:10px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.05em;border-right:1px solid var(--border)">Machine</div>
            <div class="gantt-days" style="flex:1;display:grid;grid-template-columns:repeat(5,1fr)">
              ${days.map((d, i) => `<div class="gantt-day ${i === todayIdx ? 'today' : ''}" style="padding:8px 4px;text-align:center;border-right:1px solid var(--border)">
                <div class="gantt-day-name">${d.toLocaleDateString('en-NG', { weekday: 'short' })}</div>
                <div class="gantt-day-num">${d.getDate()}</div>
              </div>`).join('')}
            </div>
          </div>
          ${machineList.map(m => _prodpScheduleRow(m, start.getTime(), endMs, days, todayIdx)).join('')}
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _prodpScheduleRow(machine, startMs, endMs, days, todayIdx) {
  const jobs = _prodpJobs.filter(j => j.machine === machine && (j.status || '').toLowerCase() !== 'cancelled');
  const meta = (typeof PROD_MACHINE_META !== 'undefined' && PROD_MACHINE_META[machine]) ? PROD_MACHINE_META[machine] : { type: '' };
  const recent = jobs[jobs.length - 1];
  const subline = recent ? `WO-${String(recent.id).padStart(4,'0')} ${recent.product_name || ''}` : meta.type;

  const bars = jobs.map(j => {
    const startD = new Date(j.scheduled_date || j.created_at || Date.now()); startD.setHours(0,0,0,0);
    const totalUnits = Math.max(Number(j.quantity_requested || j.quantity_completed || 1000), 1000);
    const spanDays = Math.max(1, Math.min(5, Math.ceil(totalUnits / 10000)));
    const endD = new Date(startD); endD.setDate(endD.getDate() + spanDays);
    const visStart = Math.max(startD.getTime(), startMs);
    const visEnd   = Math.min(endD.getTime(),   endMs);
    if (visEnd <= visStart) return null;
    const leftPct  = ((visStart - startMs) / (endMs - startMs)) * 100;
    const widthPct = ((visEnd - visStart) / (endMs - startMs)) * 100;
    const color = _prodpBarClass(j.product_name);
    const label = `${j.product_name || 'WO-' + j.id}`.substring(0, 22);
    return `<div class="g-bar ${color}" style="left:${leftPct}%;width:${widthPct}%" title="WO-${j.id} ${esc(j.product_name||'')}">${esc(label)}</div>`;
  }).filter(Boolean).join('');

  return `<div class="gantt-row" style="display:flex;border-bottom:1px solid var(--border);min-height:54px">
    <div class="gantt-row-label" style="width:140px;flex-shrink:0;padding:8px 14px;border-right:1px solid var(--border);display:flex;flex-direction:column;justify-content:center">
      <div class="g-machine">${esc(machine)}</div>
      <div class="g-product">${esc(subline)}</div>
    </div>
    <div class="gantt-cells" style="flex:1;display:grid;grid-template-columns:repeat(5,1fr);position:relative">
      ${Array.from({ length: 5 }, (_, i) => `<div class="gantt-cell ${i === todayIdx ? 'today-col' : ''}"></div>`).join('')}
      ${bars || `<div class="g-bar gr" style="left:0%;width:0%">&nbsp;</div>`}
    </div>
  </div>`;
}

function _prodpBarClass(name) {
  const n = (name || '').toLowerCase();
  if (/preform/.test(n) || /maltina|amstel|fayrouz|coke|fanta|sprite|schweppes|predator|bigi|fearless/.test(n)) return 'bl';
  if (/cap/.test(n))                              return 'tl';
  if (/eva|pure life|water/.test(n))              return 'pu';
  return 'gn';
}

/* ═══════════════════════════════════════════
   PAGE 4: prod-workorders
   ═══════════════════════════════════════════ */
async function renderProdWorkorders() {
  setHTML('#page-content', loading());
  try {
    await _prodpLoad();
    const wos = _prodpJobs.filter(j => (j.status || '').toLowerCase() !== 'cancelled');

    const inProg    = wos.filter(j => ['in_progress','active','running'].includes((j.status || '').toLowerCase())).length;
    const scheduled = wos.filter(j => (j.status || '').toLowerCase() === 'scheduled').length;
    const weekAgo = Date.now() - 7 * 86400000;
    const completedThisWeek = wos.filter(j => (j.status || '').toLowerCase() === 'completed' && new Date(j.updated_at || 0).getTime() >= weekAgo).length;
    const onHold = wos.filter(j => ['paused','on_hold'].includes((j.status || '').toLowerCase())).length;

    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = wos.filter(j => [j.product_name, j.machine, String(j.id)].some(v => String(v || '').toLowerCase().includes(term)));
      _renderProdWOTable(filtered);
    };

    setHTML('#page-content', `
      <div class="stat-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${_prodpStatCard('ti-loader', 'rgba(59,130,246,.1)', 'var(--blue2)', inProg, 'In Progress')}
        ${_prodpStatCard('ti-clock', 'rgba(245,158,11,.1)', 'var(--amber)', scheduled, 'Scheduled')}
        ${_prodpStatCard('ti-check', 'rgba(34,197,94,.1)', 'var(--green)', completedThisWeek, 'Completed This Week')}
        ${_prodpStatCard('ti-x', 'rgba(239,68,68,.1)', '#f87171', onHold, 'On Hold')}
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Work Orders <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${fmt(wos.length)} total</span></div>
          ${canManage() ? `<button class="primary-btn" style="background:var(--blue);padding:6px 12px;font-size:11.5px" onclick="typeof openAddProduction === 'function' && openAddProduction()"><i class="ti ti-plus"></i> New Work Order</button>` : ''}
        </div>
        <div id="prod-wo-table-wrap"></div>
      </div>
    `);
    _renderProdWOTable(wos);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _renderProdWOTable(items) {
  if (!items || items.length === 0) {
    setHTML('#prod-wo-table-wrap', `<div class="empty-state"><i class="ti ti-clipboard-off"></i><p>No work orders</p></div>`);
    return;
  }
  const rows = items.map(j => {
    const target = Number(j.quantity_requested || 0);
    const produced = Number(j.quantity_completed || 0);
    const pct = target ? Math.round((produced / target) * 100) : 0;
    const pill = _prodpStatusPill(j.status);
    const barColor = pct >= 100 ? 'var(--green)' : pct >= 75 ? 'var(--blue2)' : pct >= 50 ? 'var(--amber)' : '#f87171';
    let eta = '—';
    if (j.scheduled_date) {
      try { eta = new Date(j.scheduled_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch {}
    }
    return `<tr>
      <td class="mono">WO-${esc(String(j.id).padStart(4,'0'))}</td>
      <td><strong>${esc(j.product_name || '—')}</strong></td>
      <td>${fmt(target)} units</td>
      <td>${esc(j.machine || 'unassigned')}</td>
      <td>${esc(j.priority || 'normal')}</td>
      <td style="min-width:120px">
        <div class="prog" style="margin-bottom:3px"><div class="prog-f" style="width:${Math.min(100, pct)}%;background:${barColor}"></div></div>
        <span style="font-size:10px;color:var(--txt2)">${pct}% &middot; ${fmt(produced)}/${fmt(target)}</span>
      </td>
      <td>${esc(eta)}</td>
      <td><span class="pill ${pill.cls}">${pill.label}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          ${canManage() && ['in_progress','active','running','scheduled'].includes((j.status||'').toLowerCase()) ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="typeof openCompleteRun === 'function' && openCompleteRun(${j.id})" title="Complete"><i class="ti ti-check"></i></button>` : ''}
          ${canManage() ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="typeof openEditRun === 'function' && openEditRun(${j.id})" title="Edit"><i class="ti ti-edit"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  setHTML('#prod-wo-table-wrap', `
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>WO #</th><th>Product</th><th>Target Qty</th><th>Machine</th><th>Priority</th><th>Progress</th><th>ETA</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `);
}

function _prodpStatCard(icon, bg, color, val, label) {
  return `<div class="stat-card" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px">
    <div class="sc-icon" style="background:${bg};color:${color};width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0"><i class="ti ${icon}"></i></div>
    <div><div class="sc-val" style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;line-height:1">${val}</div><div class="sc-lbl" style="font-size:11px;color:var(--txt2);margin-top:3px">${label}</div></div>
  </div>`;
}
