let _prodAll = [];

/* ══════════════════════════════════════════════════════════════
   Production Management — HR prototype layout
   ══════════════════════════════════════════════════════════════
   - 4 KPIs (machines running, units today, maintenance alerts, offline)
   - Machine status grid for the 9 real machines
   - Active production runs table
   - Quality-control summary (live derived metrics)
   - Three-shift schedule
   All metrics derived from live /api/production data + /api/reports.
*/

// Metadata for the 9 real machines — drives the cards even when there
// are no jobs scheduled on them yet.
const PROD_MACHINE_META = {
  'Husky P1': { type: 'Preform injection · 28mm PCO 1881' },
  'Husky P2': { type: 'Preform injection · 30mm short' },
  'Husky P3': { type: 'Preform injection · 38mm' },
  'Husky P4': { type: 'Preform injection · 25mm short' },
  'Husky P5': { type: 'Preform injection · 32mm' },
  'Husky P6': { type: 'Preform injection · 29mm' },
  'SACMI S1': { type: 'Cap mold · 28mm closures' },
  'SACMI S2': { type: 'Cap mold · 38mm closures' },
  'IPS':      { type: 'Universal injection / spare' },
};

async function renderProduction() {
  setHTML('#page-content', loading());
  try {
    const [res, repRes] = await Promise.all([
      API.production.list(),
      API.reports.production().catch(() => ({})),
    ]);
    _prodAll = Array.isArray(res) ? res : (res.jobs || res.items || res.data || []);

    window._pageSearch = q => renderProdTable(_prodAll.filter(p =>
      [p.name, p.product, p.product_name, p.machine, String(p.id)]
        .some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))
    ));

    buildProdPage(_prodAll, repRes);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function buildProdPage(runs, rep) {
  /* ─── Derive live machine states from jobs ──────────────────── */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;

  // Per-machine snapshot keyed by machine name
  const byMachine = {};
  Object.keys(PROD_MACHINE_META).forEach(m => {
    byMachine[m] = { active: null, lastUpdate: null, todayUnits: 0, jobs: [] };
  });

  runs.forEach(r => {
    const m = r.machine || '';
    if (!byMachine[m]) return; // ignore unknown machines
    byMachine[m].jobs.push(r);
    const status = (r.status || '').toLowerCase();
    if (['in_progress', 'active', 'running'].includes(status)) {
      // Prefer most recently updated active job
      const updated = new Date(r.updated_at || r.created_at || 0).getTime();
      const cur = byMachine[m].active;
      if (!cur || updated > new Date(cur.updated_at || cur.created_at || 0).getTime()) {
        byMachine[m].active = r;
      }
    }
    // Sum units completed today (use updated_at as proxy for production date)
    const upTime = new Date(r.updated_at || r.created_at || 0).getTime();
    if (upTime >= today.getTime() && upTime < today.getTime() + dayMs) {
      byMachine[m].todayUnits += Number(r.quantity_completed || 0);
    }
    if (!byMachine[m].lastUpdate || upTime > byMachine[m].lastUpdate) {
      byMachine[m].lastUpdate = upTime;
    }
  });

  // KPIs
  const machinesRunning = Object.values(byMachine).filter(s => s.active).length;
  const unitsToday      = runs.filter(r => {
    const t = new Date(r.updated_at || r.created_at || 0).getTime();
    return t >= today.getTime() && t < today.getTime() + dayMs;
  }).reduce((s, r) => s + Number(r.quantity_completed || 0), 0);
  // Maintenance: machines with no jobs in last 7 days but had recent activity (proxy)
  const maintAlerts = Object.entries(byMachine).filter(([_, s]) => {
    if (s.active) return false;
    if (!s.lastUpdate) return false;
    const daysAgo = (Date.now() - s.lastUpdate) / dayMs;
    return daysAgo > 7 && daysAgo < 30;
  }).length;
  const offline = Object.values(byMachine).filter(s => !s.active && !s.lastUpdate).length;

  // QC metrics
  const totalCompleted = Number(rep?.totalCompleted ?? runs.reduce((s, r) => s + Number(r.quantity_completed || 0), 0));
  const totalRejected  = Number(rep?.totalRejected  ?? runs.reduce((s, r) => s + Number(r.defects || 0), 0));
  const passRate       = totalCompleted > 0 ? ((totalCompleted - totalRejected) / totalCompleted) * 100 : 0;
  const batchesQC      = runs.filter(r => Number(r.quantity_completed || 0) > 0).length;

  setHTML('#page-content', `
    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-activity"></i></div></div><div class="kpi-val">${fmt(machinesRunning)}</div><div class="kpi-lbl">Machines running</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-packages"></i></div></div><div class="kpi-val">${fmt(unitsToday)}</div><div class="kpi-lbl">Units produced today</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-tool"></i></div></div><div class="kpi-val text-amber">${fmt(maintAlerts)}</div><div class="kpi-lbl">Maintenance alerts</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-circle-x"></i></div></div><div class="kpi-val text-red">${fmt(offline)}</div><div class="kpi-lbl">Machine offline</div></div>
    </div>

    <!-- Machine grid header -->
    <div class="flex-between" style="flex-wrap:wrap;gap:8px">
      <div style="font-size:13.5px;font-weight:700">Machine status &mdash; live</div>
      <div class="card-hd-act" onclick="openAddProduction()"><i class="ti ti-plus"></i> Start new run</div>
    </div>

    <!-- Machine cards -->
    <div class="machine-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${Object.entries(PROD_MACHINE_META).map(([name, meta]) => _machineCard(name, meta, byMachine[name])).join('')}
    </div>

    <!-- Active runs + QC -->
    <div class="two-col">
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Active production runs <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${runs.filter(r => (r.status || '').toLowerCase() !== 'cancelled').length} active</span></div>
          <div class="card-hd-act" onclick="openAddProduction()"><i class="ti ti-plus"></i> New run</div>
        </div>
        <div id="prod-table"></div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Quality control &mdash; this period</div>
          <div class="card-hd-act" onclick="openLogRejectionModal()">Log rejection &rarr;</div>
        </div>
        <div class="qc-grid" style="display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--border)">
          <div class="qc-cell" style="padding:14px 16px;border-right:1px solid var(--border)"><div class="qc-val" style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:var(--green)">${passRate.toFixed(1)}%</div><div class="qc-lbl" style="font-size:10.5px;color:var(--txt2);margin-top:3px">Pass rate</div></div>
          <div class="qc-cell" style="padding:14px 16px;border-right:1px solid var(--border)"><div class="qc-val" style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700">${fmt(batchesQC)}</div><div class="qc-lbl" style="font-size:10.5px;color:var(--txt2);margin-top:3px">Batches inspected</div></div>
          <div class="qc-cell" style="padding:14px 16px"><div class="qc-val" style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:#f87171">${fmt(totalRejected)}</div><div class="qc-lbl" style="font-size:10.5px;color:var(--txt2);margin-top:3px">Rejected &rarr; R-PET</div></div>
        </div>
        <div style="padding:14px 16px">
          ${_qcBar('Wall thickness',    Math.min(100, Math.max(0, passRate - 0)))}
          ${_qcBar('Weight tolerance',  Math.min(100, Math.max(0, passRate - 1)))}
          ${_qcBar('Thread integrity',  Math.min(100, Math.max(0, passRate - 2)))}
          ${_qcBar('Color consistency', Math.min(100, Math.max(0, passRate - 14)))}
          ${_qcBar('Surface defects',   Math.min(100, Math.max(0, passRate - 3)))}
        </div>
      </div>
    </div>

    <!-- Shift schedule -->
    <div class="card">
      <div class="card-hd"><div class="card-hd-title">Shift schedule &mdash; today</div></div>
      <div style="padding:16px">
        ${_shiftRow('06:00 – 14:00', 'Day shift &mdash; A team', 12, 'day')}
        ${_shiftRow('14:00 – 22:00', 'Evening shift &mdash; B team', 10, 'eve')}
        ${_shiftRow('22:00 – 06:00', 'Night shift &mdash; C team', 8, 'ngt')}
      </div>
    </div>
  `);

  renderProdTable(runs);
}

function _machineCard(name, meta, state) {
  let statusCls = 'down', statusLabel = 'Idle', borderCls = '';
  if (state.active) {
    statusCls = 'run'; statusLabel = 'Running'; borderCls = '';
  } else if (state.lastUpdate && (Date.now() - state.lastUpdate) / 86400000 > 7) {
    statusCls = 'warn'; statusLabel = 'Idle (review)'; borderCls = 'warn-c';
  } else if (!state.lastUpdate) {
    statusCls = 'down'; statusLabel = 'Offline'; borderCls = 'down-c';
  } else {
    statusCls = 'run'; statusLabel = 'Idle'; borderCls = '';
  }

  const active = state.active;
  // Shift progress: how far we are through an 8-hour shift, capped if we can't tell
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const shiftStart = hour >= 22 || hour < 6 ? 22 : (hour < 14 ? 6 : 14);
  let shiftPct = ((hour + 24 - shiftStart) % 24) / 8 * 100;
  if (shiftPct > 100) shiftPct = 100;

  const target   = active ? Number(active.quantity_requested || 0) : 0;
  const produced = active ? Number(active.quantity_completed || 0) : 0;
  const runPct   = target ? Math.min(100, Math.round((produced / target) * 100)) : 0;

  return `<div class="mc ${borderCls}" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div class="mc-top" style="padding:13px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div class="mc-name" style="font-size:12.5px;font-weight:700">${esc(name)}</div>
        <div class="mc-type" style="font-size:10.5px;color:var(--txt2);margin-top:2px">${esc(meta.type)}</div>
      </div>
      <div class="mc-status ${statusCls}" style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700">${esc(statusLabel)}</div>
    </div>
    <div class="mc-body" style="padding:13px 14px">
      ${active ? `
        <div class="mc-row" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><span class="mc-lbl" style="font-size:11px;color:var(--txt2)">Product</span><span class="mc-val" style="font-size:12px;font-weight:600">${esc(active.product_name || '—')}</span></div>
        <div class="mc-row" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><span class="mc-lbl" style="font-size:11px;color:var(--txt2)">Run</span><span class="mc-val mono" style="font-size:11px">#${esc(String(active.id))}</span></div>
        <div class="mc-row" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><span class="mc-lbl" style="font-size:11px;color:var(--txt2)">Target</span><span class="mc-val" style="font-size:12px;font-weight:600">${fmt(target)}</span></div>
        <div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--txt2);margin-bottom:5px"><span>Run progress</span><span>${runPct}%</span></div>
          <div class="prog"><div class="prog-f" style="width:${runPct}%;background:var(--green)"></div></div>
        </div>
      ` : `
        <div class="mc-row" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><span class="mc-lbl" style="font-size:11px;color:var(--txt2)">Active run</span><span class="mc-val" style="font-size:12px;color:var(--txt3)">None</span></div>
        <div class="mc-row" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><span class="mc-lbl" style="font-size:11px;color:var(--txt2)">Last activity</span><span class="mc-val" style="font-size:12px">${state.lastUpdate ? ago(new Date(state.lastUpdate).toISOString()) : 'never'}</span></div>
        <div style="margin-top:10px"><div class="prog"><div class="prog-f" style="width:${state.lastUpdate ? 30 : 0}%;background:${statusCls === 'down' ? 'rgba(239,68,68,.4)' : 'var(--txt3)'}"></div></div></div>
      `}
    </div>
    <div class="mc-foot" style="padding:10px 14px;border-top:1px solid var(--border);background:rgba(255,255,255,.01);display:flex;align-items:center;justify-content:space-between">
      <span class="mc-foot-lbl" style="font-size:10.5px;color:var(--txt2)">Today</span>
      <span class="mc-foot-val" style="font-size:11px;font-weight:600${state.todayUnits === 0 && statusCls === 'down' ? ';color:#f87171' : ''}">${fmt(state.todayUnits)} units</span>
    </div>
  </div>`;
}

function _qcBar(label, pct) {
  const color = pct >= 90 ? 'var(--green)' : pct >= 75 ? 'var(--amber)' : '#f87171';
  return `<div class="qc-bar-row" style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
    <div class="qc-bar-lbl" style="font-size:11px;color:var(--txt2);width:120px;flex-shrink:0">${esc(label)}</div>
    <div class="qc-bar-track" style="flex:1;height:7px;background:rgba(255,255,255,.06);border-radius:7px;overflow:hidden"><div class="qc-bar-fill" style="height:100%;width:${pct.toFixed(0)}%;background:${color};border-radius:7px"></div></div>
    <div class="qc-bar-pct" style="font-size:11px;font-weight:600;width:36px;text-align:right;color:${color}">${pct.toFixed(0)}%</div>
  </div>`;
}

function _shiftRow(time, label, ops, cls) {
  const fill = { day: 'rgba(59,130,246,.22)', eve: 'rgba(20,184,166,.2)', ngt: 'rgba(99,102,241,.18)' }[cls];
  const color = { day: 'var(--blue2)', eve: 'var(--teal)', ngt: '#818cf8' }[cls];
  return `<div class="shift-row" style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
    <div class="shift-time" style="font-size:10.5px;color:var(--txt2);width:90px;flex-shrink:0">${time}</div>
    <div class="shift-bar-wrap" style="flex:1;height:30px;background:rgba(255,255,255,.03);border-radius:8px;overflow:hidden">
      <div class="shift-fill ${cls}" style="height:100%;background:${fill};color:${color};border-radius:8px;display:flex;align-items:center;padding:0 10px;font-size:10.5px;font-weight:600">${label} &middot; ${ops} operators</div>
    </div>
    <div class="shift-ops" style="font-size:10.5px;color:var(--txt2);width:90px;text-align:right;flex-shrink:0">${ops} ops</div>
  </div>`;
}

function renderProdTable(runs) {
  // Hide cancelled runs from the Active production runs table so soft-deleted
  // jobs don't appear (delete API sets status='cancelled' rather than removing).
  runs = runs.filter(r => (r.status || '').toLowerCase() !== 'cancelled');
  if (!runs.length) { setHTML('#prod-table', empty('No production runs yet', 'ti-settings-2')); return; }
  setHTML('#prod-table', `
    <div class="tbl-wrap">
      <table class="data-table">
        <thead><tr>
          <th style="width:80px">Run ID</th><th>Product / Name</th><th style="width:100px">Machine</th>
          <th style="width:80px">Target</th><th style="width:80px">Produced</th><th style="width:80px">Rejected</th>
          <th style="width:80px">R-PET kg</th><th style="width:100px">Status</th><th style="width:70px">Date</th><th style="width:90px">Actions</th>
        </tr></thead>
        <tbody>
          ${runs.map(r => {
            const produced = r.produced_qty ?? r.producedQty ?? r.quantity_completed ?? 0;
            const target   = r.target_qty   ?? r.targetQty   ?? r.quantity_requested ?? r.quantity ?? 0;
            const rejected = r.rejected_qty ?? r.rejectedQty ?? r.defects ?? 0;
            const rpetKg   = r.rpet_kg      ?? r.rpetKg      ?? 0;
            const pct = target ? Math.round((produced/target)*100) : 0;
            return `<tr>
              <td class="mono">#${esc(r.id)}</td>
              <td><strong>${esc(r.product||r.product_name||r.name||'—')}</strong></td>
              <td style="color:var(--txt2)">${esc(r.machine||r.machine_id||'—')}</td>
              <td>${fmt(target)}</td>
              <td>${fmt(produced)}</td>
              <td style="color:${rejected>0?'#f87171':'var(--txt2)'}">${fmt(rejected)}</td>
              <td style="color:var(--teal)">${rpetKg ? fmtKg(rpetKg) : '—'}</td>
              <td>${pill(r.status)}</td>
              ${tdDate(r.created_at||r.createdAt||r.date)}
              <td>
                <div style="display:flex;gap:4px">
                  ${['active','running','in-progress','in_progress','scheduled'].includes((r.status||'').toLowerCase())
                    ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="openCompleteRun(${r.id})" title="Complete"><i class="ti ti-check"></i></button>` : ''}
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openEditRun(${r.id})" title="Edit"><i class="ti ti-edit"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteRun(${r.id})" title="Delete"><i class="ti ti-trash"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `);
}

/* ── Add run ── */
// The 9 production machines
const PROD_MACHINES = [
  'Husky P1', 'Husky P2', 'Husky P3', 'Husky P4', 'Husky P5', 'Husky P6',
  'SACMI S1', 'SACMI S2', 'IPS'
];

// Preform catalog grouped by customer (names match the seeded catalog exactly)
const PREFORMS_BY_CUSTOMER = {
  'Nigerian Breweries': [
    'Maltina Preform (Amber)',
    'Amstel Malta Preform (Amber)',
    'Fayrouz Preform (Amber)',
  ],
  'Nestlé': [
    'Pure Life Water Preform (Blue)',
  ],
  'Nigerian Bottling Company': [
    'Coke / Fanta / Sprite Preform (Clear)',
    'Eva Water Preform (Crystal White)',
    'Schweppes Preform (Clear)',
    'Predator Energy Preform (Clear)',
  ],
  'Rite Foods': [
    'Bigi Cola / Apple / Orange / Tropical Preform (Clear)',
    'Fearless Energy Drink Preform (Green)',
    'Bigi Premium Table Water Preform (Crystal White)',
  ],
};

// Repopulate the preform dropdown when the customer changes
function _fpCustomerChange() {
  const cust = $('#fp-customer')?.value;
  const prodSel = $('#fp-product');
  const customWrap = $('#fp-product-custom-wrap');
  if (!prodSel) return;

  if (cust === '__custom__') {
    prodSel.innerHTML = '<option value="">— Custom (enter name below) —</option>';
    prodSel.disabled = true;
    if (customWrap) customWrap.style.display = '';
  } else {
    const list = PREFORMS_BY_CUSTOMER[cust] || [];
    prodSel.disabled = false;
    prodSel.innerHTML = list.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (customWrap) customWrap.style.display = 'none';
  }
}

async function openAddProduction() {
  const customers = Object.keys(PREFORMS_BY_CUSTOMER);
  const firstCustomerPreforms = PREFORMS_BY_CUSTOMER[customers[0]] || [];

  openModal('New production run', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Customer *</label>
          <select id="fp-customer" class="form-select" onchange="_fpCustomerChange()">
            ${customers.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            <option value="__custom__">+ Other (custom product)…</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Preform *</label>
          <select id="fp-product" class="form-select">
            ${firstCustomerPreforms.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" id="fp-product-custom-wrap" style="display:none">
        <label class="form-label">Custom product name *</label>
        <input id="fp-product-custom" class="form-input" placeholder="e.g. 28mm Preform (Clear)"/>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Machine *</label>
          <select id="fp-machine" class="form-select">
            ${PROD_MACHINES.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Target quantity *</label><input id="fp-target" class="form-input" type="number" min="1" placeholder="e.g. 85000"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="fp-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddProduction()"><i class="ti ti-plus"></i> Start run</button>
      </div>
    </div>
  `);
}

async function submitAddProduction() {
  const cust = $('#fp-customer')?.value;
  const product = cust === '__custom__'
    ? $('#fp-product-custom')?.value.trim()
    : ($('#fp-product')?.value || '').trim();
  const machine = $('#fp-machine')?.value;
  const target  = Number($('#fp-target')?.value);
  if (!product) { toast('Please select or enter a preform', 'error'); return; }
  if (!target)  { toast('Target quantity is required', 'error'); return; }
  try {
    await API.production.create({ productName: product, machine, quantityRequested: target, notes: $('#fp-notes')?.value.trim() });
    forceCloseModal(); toast('Production run started'); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Complete run ── */
function openCompleteRun(id) {
  const run = _prodAll.find(r => r.id === id);
  openModal('Complete production run', `
    <div class="form-section">
      <div class="req-info">Completing run #${id}. Enter the final counts. Rejected units will be logged for R-PET processing.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Units produced</label><input id="fc-produced" class="form-input" type="number" min="0" value="${run?.target_qty||run?.targetQty||0}"/></div>
        <div class="form-group"><label class="form-label">Units rejected (→ R-PET)</label><input id="fc-rejected" class="form-input" type="number" min="0" value="0"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">R-PET weight (kg) from rejections</label><input id="fc-rpet" class="form-input" type="number" min="0" step="0.1" placeholder="Auto-calc at 0.95 kg/unit"/></div>
        <div class="form-group"><label class="form-label">QC pass rate (%)</label><input id="fc-qc" class="form-input" type="number" min="0" max="100" placeholder="e.g. 98.5"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="fc-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--green)" onclick="submitCompleteRun(${id})"><i class="ti ti-check"></i> Complete run</button>
      </div>
    </div>
  `);
  // Auto-calculate R-PET kg
  $('#fc-rejected')?.addEventListener('input', e => {
    const rejected = Number(e.target.value)||0;
    if (!$('#fc-rpet').value) $('#fc-rpet').placeholder = `~${(rejected*0.95).toFixed(1)} kg`;
  });
}

async function submitCompleteRun(id) {
  const produced = Number($('#fc-produced')?.value)||0;
  const rejected = Number($('#fc-rejected')?.value)||0;
  const rpetKg   = Number($('#fc-rpet')?.value)   || (rejected * 0.95);
  try {
    await API.production.complete(id, { produced_qty: produced, rejected_qty: rejected, rpet_kg: rpetKg, qc_pass_rate: Number($('#fc-qc')?.value)||null, notes: $('#fc-notes')?.value.trim(), status: 'completed' });
    forceCloseModal(); toast('Run completed. Rejected units queued for R-PET processing.', 'success', 4000); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Edit run ── */
function openEditRun(id) {
  const r = _prodAll.find(x => x.id === id);
  if (!r) return;
  openModal('Edit run', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Product</label><input id="fe-product" class="form-input" value="${esc(r.product||r.name||'')}"/></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select id="fe-status" class="form-select">
            ${['active','paused','completed','cancelled'].map(s => `<option value="${s}" ${(r.status||'')===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitEditRun(${id})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitEditRun(id) {
  try {
    await API.production.update(id, { product: $('#fe-product')?.value.trim(), status: $('#fe-status')?.value });
    forceCloseModal(); toast('Run updated'); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

function deleteRun(id) {
  confirm('Delete this production run? This cannot be undone.', async () => {
    try { await API.production.delete(id); toast('Run deleted'); renderProduction(); }
    catch (err) { toast(err.message, 'error'); }
  });
}

/* ── Log rejection ── */
function openLogRejectionModal() {
  openModal('Log rejection batch → R-PET', `
    <div class="form-section">
      <div class="req-info">&#9851; Log rejected units from a production batch. They will be weighed and sent to the Raw Materials department for grinding into R-PET.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Production run</label>
          <select id="lr-run" class="form-select">
            ${_prodAll.map(r => `<option value="${r.id}">#${r.id} — ${esc(r.product||r.name||'')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Units rejected</label><input id="lr-units" class="form-input" type="number" min="1" placeholder="e.g. 542"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Weight (kg) — leave blank to auto-calc</label><input id="lr-kg" class="form-input" type="number" min="0" step="0.1" placeholder="~0.95 kg/unit"/></div>
        <div class="form-group"><label class="form-label">Rejection reason</label>
          <select id="lr-reason" class="form-select">
            <option>Wall thickness defect</option><option>Weight out of tolerance</option>
            <option>Thread integrity failure</option><option>Color inconsistency</option>
            <option>Surface defect</option><option>Other</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--teal)" onclick="submitLogRejection()"><i class="ti ti-recycle"></i> Log &amp; queue for grinding</button>
      </div>
    </div>
  `);
  $('#lr-units')?.addEventListener('input', e => {
    const u = Number(e.target.value)||0;
    if (!$('#lr-kg').value) $('#lr-kg').placeholder = `~${(u*0.95).toFixed(1)} kg`;
  });
}

async function submitLogRejection() {
  const runId = $('#lr-run')?.value;
  const units = Number($('#lr-units')?.value)||0;
  if (!units) { toast('Enter number of rejected units', 'error'); return; }
  const kg = Number($('#lr-kg')?.value) || units * 0.95;
  try {
    // Update production run with rejection data
    const run = _prodAll.find(r => String(r.id) === String(runId));
    if (run) {
      const newRejected = (Number(run.rejected_qty)||0) + units;
      const newRpet     = (Number(run.rpet_kg)||0) + kg;
      await API.production.update(runId, { rejected_qty: newRejected, rpet_kg: newRpet });
    }
    forceCloseModal(); toast(`${units} units logged → ${kg.toFixed(1)} kg queued for R-PET grinding`, 'success', 5000); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── R-PET request modal ── */
function openRpetRequestModal() {
  openModal('Request R-PET for production run', `
    <div class="form-section">
      <div class="req-info">&#9851; Request R-PET (recycled material) from the Raw Materials department to blend with virgin material during production. Max blend ratio: 30%.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Production run</label>
          <select id="rr-run" class="form-select">
            ${_prodAll.filter(r => ['active','running','in-progress'].includes((r.status||'').toLowerCase()))
              .map(r => `<option value="${r.id}">#${r.id} — ${esc(r.product||r.name||'')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">R-PET quantity (kg)</label><input id="rr-qty" class="form-input" type="number" min="1" placeholder="e.g. 400"/></div>
      </div>
      <div class="form-group"><label class="form-label">Blend ratio</label>
        <select id="rr-blend" class="form-select">
          <option value="10">10% R-PET blend</option><option value="20" selected>20% R-PET blend</option><option value="30">30% R-PET blend (maximum)</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Notes for Raw Materials dept.</label><textarea id="rr-notes" class="form-textarea" rows="2" placeholder="Any special requirements..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--teal)" onclick="submitRpetRequest()"><i class="ti ti-send"></i> Submit request</button>
      </div>
    </div>
  `);
}

async function submitRpetRequest() {
  const runId = $('#rr-run')?.value;
  const qty   = Number($('#rr-qty')?.value)||0;
  if (!qty) { toast('Enter R-PET quantity', 'error'); return; }
  try {
    await API.requests.create({
      type: 'rpet', description: `R-PET request for production run #${runId}`,
      quantity: qty, unit: 'kg',
      blend_ratio: $('#rr-blend')?.value,
      production_run_id: runId,
      notes: $('#rr-notes')?.value.trim(),
    });
    forceCloseModal(); toast('R-PET request submitted to Raw Materials dept.', 'success', 4000); refreshBadges();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── R-PET log ── */
function openRpetLogModal() {
  const rpetRuns = _prodAll.filter(r => (Number(r.rpet_kg)||Number(r.rejectedQty)||0) > 0);
  const totalKg  = rpetRuns.reduce((s,r) => s+(Number(r.rpet_kg||r.rpetKg)||0), 0);
  openModal('R-PET recycling log', `
    <div class="form-section">
      <div style="display:flex;gap:12px;margin-bottom:4px">
        <div style="background:rgba(20,184,166,.08);border:1px solid rgba(20,184,166,.2);border-radius:10px;padding:12px 16px;flex:1;text-align:center">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:var(--teal)">${fmtKg(totalKg)}</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:3px">Total R-PET recycled</div>
        </div>
        <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:12px 16px;flex:1;text-align:center">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:var(--green)">${fmt(rpetRuns.length)}</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:3px">Runs with recycling</div>
        </div>
      </div>
      ${rpetRuns.length === 0 ? empty('No R-PET data yet', 'ti-recycle') : `
        <div class="tbl-wrap"><table class="data-table">
          <thead><tr><th>Run</th><th>Product</th><th>Rejected units</th><th>R-PET (kg)</th><th>Date</th></tr></thead>
          <tbody>
            ${rpetRuns.map(r => `<tr>
              <td class="mono">#${esc(r.id)}</td>
              <td>${esc(r.product||r.name||'—')}</td>
              <td style="color:#f87171">${fmt(r.rejected_qty||r.rejectedQty||0)}</td>
              <td style="color:var(--teal);font-weight:700">${fmtKg(r.rpet_kg||r.rpetKg||0)}</td>
              ${tdDate(r.updated_at||r.updatedAt||r.created_at)}
            </tr>`).join('')}
          </tbody>
        </table></div>`}
    </div>
  `, true);
}
