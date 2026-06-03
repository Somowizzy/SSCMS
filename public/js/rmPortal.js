/* ══════════════════════════════════════════════════════════════
   rmPortal.js — Raw Materials Department Portal
   ══════════════════════════════════════════════════════════════
   Per-dept-1 (Raw Materials) view. Four sub-pages:
     - rm-dash       (dashboard)
     - rm-inventory  (full inventory table)
     - rm-receiving  (pending POs + GRN log + Raise GRN form)
     - rm-warehouse  (zone map + put-away tasks)
   All data lives in shared backend tables — cross-department
   updates flow through automatically (a Production request to
   Raw Materials appears here on the next render or refresh).
*/

let _rmpInv     = [];   // inventory rows
let _rmpReqs    = [];   // requests targeting RM dept
let _rmpAudits  = [];   // audit entries (used for the GRN log)
let _rmpLastFetch = 0;

/* ─── Shared loader (used by all 4 pages) ─────────────────── */
async function _rmpLoad() {
  // Re-fetch on each page render to keep cross-department updates live.
  const [invRes, reqRes, audRes] = await Promise.all([
    API.inventory.list().catch(() => ({ items: [] })),
    API.requests.list().catch(() => ({ requests: [] })),
    API.audit.list('?module=inventory&limit=30').catch(() => ({ logs: [] })),
  ]);
  const allInv = Array.isArray(invRes) ? invRes : (invRes.items || []);
  _rmpInv = allInv.filter(i => (i.category || '').toLowerCase() === 'raw_material');
  const allReqs = Array.isArray(reqRes) ? reqRes : (reqRes.requests || reqRes.items || []);
  _rmpReqs = allReqs.filter(r => Number(r.target_department_id) === 1);
  _rmpAudits = Array.isArray(audRes) ? audRes : (audRes.logs || []);
  _rmpLastFetch = Date.now();
}

/* ── Helpers ──────────────────────────────────────────────── */
function _rmpStatus(item) {
  const qty = Number(item.quantity_on_hand || 0);
  const reorder = Number(item.reorder_level || 1);
  if (qty <= reorder * 0.3) return { label: 'Critical', cls: 'r', color: '#f87171' };
  if (qty <= reorder)        return { label: 'Low Stock', cls: 'a', color: 'var(--amber)' };
  return                          { label: 'In Stock',  cls: 'g', color: 'var(--green)' };
}
function _rmpSku(item) { return item.sku || `RM-${String(item.product_id || item.id).padStart(3, '0')}`; }
function _rmpFmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function _rmpToday(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(d)) return false;
  const t = new Date(); t.setHours(0,0,0,0);
  return d.getTime() >= t.getTime() && d.getTime() < t.getTime() + 86400000;
}

/* ═══════════════════════════════════════════
   PAGE 1: rm-dash
   ═══════════════════════════════════════════ */
async function renderRmDash() {
  setHTML('#page-content', loading());
  try {
    await _rmpLoad();
    const items = _rmpInv;

    const totalKg     = items.reduce((s, i) => s + Number(i.quantity_on_hand || 0), 0);
    const posPending  = _rmpReqs.filter(r => (r.status || '').toLowerCase() === 'pending').length;
    const grnsToday   = _rmpAudits.filter(a => /received|inventory updated/i.test(a.action || '') && _rmpToday(a.created_at)).length;
    const lowItems    = items.filter(i => Number(i.quantity_on_hand || 0) <= Number(i.reorder_level || 0));
    const criticalLines = lowItems.filter(i => Number(i.quantity_on_hand || 0) <= Number(i.reorder_level || 0) * 0.3);

    // Zones derived from `location`
    const zoneMap = {};
    items.forEach(i => {
      const z = (i.location || 'Unassigned').trim();
      if (!zoneMap[z]) zoneMap[z] = { used: 0, capacity: 20000 };
      zoneMap[z].used += Number(i.quantity_on_hand || 0);
    });
    const zoneEntries = Object.entries(zoneMap).sort();

    const h = new Date().getHours();
    const period = (typeof greeting === 'function' ? greeting() : (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'));
    const firstName = App.user?.firstName || App.user?.first_name || App.user?.name || 'there';
    const dateStr = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    setHTML('#page-content', `
      <!-- Greeting -->
      <div style="font-size:14px;color:var(--txt2);margin-bottom:2px">
        Good ${period}, <strong style="color:var(--txt)">${esc(firstName)}</strong> &mdash; ${dateStr}
      </div>

      <!-- 4 KPIs -->
      <div class="kpi-grid">
        <div class="kpi" onclick="goTo('rm-inventory')">
          <div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-box"></i></div><span class="kpi-delta up">${items.length} items</span></div>
          <div class="kpi-val">${(totalKg / 1000).toFixed(1)} t</div>
          <div class="kpi-lbl">Total RM Stock</div>
        </div>
        <div class="kpi" onclick="goTo('rm-receiving')">
          <div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-file-invoice"></i></div>${posPending > 0 ? `<span class="kpi-delta nu">${posPending} pending</span>` : ''}</div>
          <div class="kpi-val">${fmt(posPending)}</div>
          <div class="kpi-lbl">Purchase Orders Pending</div>
        </div>
        <div class="kpi" onclick="goTo('rm-receiving')">
          <div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-truck-loading"></i></div><span class="kpi-delta up">Today</span></div>
          <div class="kpi-val">${fmt(grnsToday)}</div>
          <div class="kpi-lbl">GRNs Processed Today</div>
        </div>
        <div class="kpi" onclick="goTo('rm-inventory')">
          <div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-alert-triangle"></i></div>${lowItems.length > 0 ? `<span class="kpi-delta dn">Alert</span>` : ''}</div>
          <div class="kpi-val ${lowItems.length > 0 ? 'text-red' : ''}">${fmt(lowItems.length)}</div>
          <div class="kpi-lbl">Low Stock Items</div>
        </div>
      </div>

      ${lowItems.length > 0 ? `
      <div class="info-banner amber" style="display:flex;align-items:flex-start;gap:12px;border-radius:10px;padding:13px 16px;font-size:12px;line-height:1.6;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:var(--amber)">
        <i class="ti ti-alert-triangle" style="font-size:18px;flex-shrink:0;margin-top:1px"></i>
        <div><strong>Low Stock Alert:</strong> ${lowItems.slice(0,3).map(i => esc(i.name)).join(', ')}${lowItems.length > 3 ? ` +${lowItems.length - 3} more` : ''} ${criticalLines.length > 0 ? '— ' + criticalLines.length + ' critical' : ''}. Review the receiving page for incoming POs.</div>
      </div>` : ''}

      <div class="two-col-wide">
        <!-- Stock Level Overview -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Stock Level Overview</div>
            <span class="card-hd-act" onclick="goTo('rm-inventory')">Full inventory &rarr;</span>
          </div>
          ${items.length === 0
            ? `<div class="empty-state"><i class="ti ti-box-off"></i><p>No raw materials yet</p></div>`
            : items.slice(0, 6).map(i => _rmpInvRow(i)).join('')}
        </div>

        <!-- Right column: Incoming Today + Warehouse Status -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="card">
            <div class="card-hd">
              <div class="card-hd-title">Incoming &amp; Requests</div>
              <span class="card-hd-act" onclick="goTo('rm-receiving')">View all &rarr;</span>
            </div>
            ${_rmpReqs.filter(r => (r.status||'').toLowerCase() === 'pending').length === 0
              ? `<div class="empty-state"><i class="ti ti-clipboard-check text-green"></i><p>No pending requests</p></div>`
              : _rmpReqs.filter(r => (r.status||'').toLowerCase() === 'pending').slice(0, 4).map(r => `
                <div class="feed-item">
                  <div class="feed-dot" style="background:${r.priority === 'urgent' || r.priority === 'high' ? '#f87171' : 'var(--amber)'}"></div>
                  <div class="feed-body">
                    <div class="feed-title">REQ-${esc(String(r.id).padStart(4,'0'))} &middot; ${esc(r.requester_name || '—')}</div>
                    <div class="feed-sub">${fmt(r.quantity || 0)} units &middot; ${esc(r.notes || (r.request_type || '').replace(/_/g, ' '))}</div>
                  </div>
                  <div class="feed-time">${esc(r.priority || 'normal')}</div>
                </div>
              `).join('')}
          </div>

          <div class="card">
            <div class="card-hd">
              <div class="card-hd-title">Warehouse Status</div>
              <span class="card-hd-act" onclick="goTo('rm-warehouse')">View zones &rarr;</span>
            </div>
            <div style="padding:13px 16px;display:flex;flex-direction:column;gap:9px">
              ${zoneEntries.length === 0 ? `<div style="color:var(--txt2);font-size:11px">No zone data</div>` : zoneEntries.slice(0,4).map(([name, z]) => {
                const pct = Math.min(100, Math.round((z.used / z.capacity) * 100));
                const color = pct > 85 ? '#f87171' : pct > 60 ? 'var(--amber)' : 'var(--green)';
                return `<div style="display:flex;align-items:center;gap:10px">
                  <div style="font-size:11px;color:var(--txt2);width:120px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
                  <div style="flex:1;height:7px;background:rgba(128,128,128,.1);border-radius:7px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${color};border-radius:7px"></div></div>
                  <div style="font-size:11px;font-weight:600;width:42px;text-align:right;color:${color}">${pct}%</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _rmpInvRow(i) {
  const qty = Number(i.quantity_on_hand || 0);
  const reorder = Number(i.reorder_level || 1);
  const pct = Math.max(0, Math.min(100, Math.round((qty / Math.max(reorder * 2, 1)) * 100)));
  const s = _rmpStatus(i);
  return `<div class="inv-row">
    <div class="inv-row-top">
      <div>
        <div class="inv-name">${esc(i.name)}</div>
        <div class="inv-meta">${esc(_rmpSku(i))} &middot; ${esc(i.location || 'Unassigned')}</div>
      </div>
      <div class="inv-qty" style="color:${s.color}">${fmt(qty)} ${esc(i.unit || 'kg')}</div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${pct}%;background:${s.color}"></div></div>
  </div>`;
}

/* ═══════════════════════════════════════════
   PAGE 2: rm-inventory
   ═══════════════════════════════════════════ */
async function renderRmInventory() {
  setHTML('#page-content', loading());
  try {
    await _rmpLoad();
    const items = _rmpInv;
    const totalKg = items.reduce((s, i) => s + Number(i.quantity_on_hand || 0), 0);

    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = items.filter(i => [i.name, i.sku, i.location, i.category].some(v => String(v || '').toLowerCase().includes(term)));
      _renderRmInvTable(filtered);
    };

    setHTML('#page-content', `
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Raw Material Inventory</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="pill gr">${(totalKg / 1000).toFixed(1)} t total &middot; ${items.length} SKUs</span>
            <button class="primary-btn" style="background:#f59e0b;box-shadow:0 2px 8px rgba(245,158,11,.3);padding:6px 12px;font-size:11.5px" onclick="openRmAddMaterial()"><i class="ti ti-plus"></i> Add Material</button>
          </div>
        </div>
        <div id="rm-inv-table-wrap"></div>
      </div>
    `);
    _renderRmInvTable(items);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _renderRmInvTable(items) {
  if (items.length === 0) {
    setHTML('#rm-inv-table-wrap', `<div class="empty-state"><i class="ti ti-box-off"></i><p>No materials found</p></div>`);
    return;
  }
  setHTML('#rm-inv-table-wrap', `
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr>
        <th>Material Name</th><th>SKU</th><th>On Hand</th><th>Unit</th>
        <th>Reorder Point</th><th>Zone</th><th>Last Received</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(i => {
          const qty = Number(i.quantity_on_hand || 0);
          const reorder = Number(i.reorder_level || 1);
          const s = _rmpStatus(i);
          return `<tr>
            <td><strong>${esc(i.name)}</strong></td>
            <td class="mono">${esc(_rmpSku(i))}</td>
            <td><strong style="color:${s.color}">${fmt(qty)}</strong></td>
            <td>${esc(i.unit || 'kg')}</td>
            <td>${fmt(reorder)} ${esc(i.unit || 'kg')}</td>
            <td>${esc(i.location || '—')}</td>
            <td style="color:var(--txt2);font-size:11px">${i.last_updated ? new Date(i.last_updated).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
            <td><span class="pill ${s.cls}">${s.label}</span></td>
            <td><div style="display:flex;gap:4px">
              <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="openRmReceiveForItem(${i.id}, '${esc(i.name)}')" title="Receive"><i class="ti ti-truck-loading"></i></button>
              <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openRmAdjustItem(${i.id})" title="Adjust"><i class="ti ti-adjustments"></i></button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `);
}

/* ═══════════════════════════════════════════
   PAGE 3: rm-receiving
   ═══════════════════════════════════════════ */
async function renderRmReceiving() {
  setHTML('#page-content', loading());
  try {
    await _rmpLoad();
    const pending = _rmpReqs.filter(r => (r.status || '').toLowerCase() === 'pending');
    const grnLog  = _rmpAudits.filter(a => /received|inventory updated|product added/i.test(a.action || '')).slice(0, 6);

    setHTML('#page-content', `
      <div class="two-col">
        <!-- Pending POs -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Pending Material Requests</div>
            <span class="pill a">${pending.length} pending</span>
          </div>
          ${pending.length === 0
            ? `<div class="empty-state"><i class="ti ti-clipboard-check text-green"></i><p>No pending requests</p></div>`
            : pending.map(r => {
                const urgent = r.priority === 'urgent' || r.priority === 'high';
                const iconBg = urgent ? 'rgba(239,68,68,.1);color:#f87171' : 'rgba(245,158,11,.1);color:var(--amber)';
                return `<div class="manifest-row">
                  <div class="mr-icon" style="background:${iconBg.split(';')[0]};color:${iconBg.split(';')[1].replace('color:','')}"><i class="ti ti-clipboard-list"></i></div>
                  <div class="mr-info">
                    <div class="mr-id">REQ-${esc(String(r.id).padStart(4,'0'))}</div>
                    <div class="mr-sub">${esc(r.requester_name || '—')} &middot; ${fmt(r.quantity || 0)} units &middot; ${esc(r.notes || (r.request_type || '').replace(/_/g, ' '))}</div>
                    <div class="mr-meta"><span class="pill ${urgent ? 'r' : 'a'}">${esc(r.priority || 'normal')}</span><span class="mono">${ago(r.created_at)}</span></div>
                  </div>
                  <div class="mr-right" style="display:flex;flex-direction:column;gap:4px">
                    ${canManage() ? `<button class="primary-btn" style="background:#f59e0b;padding:5px 10px;font-size:11px" onclick="rmApproveRequest(${r.id})">Approve</button>` : ''}
                    <button class="sec-btn" style="padding:5px 10px;font-size:11px" onclick="openRmGRN({reqId:${r.id}, productId:${r.product_id || 'null'}, qty:${r.quantity || 0}})">Receive</button>
                  </div>
                </div>`;
              }).join('')}

          <div style="padding:12px 16px;border-top:1px solid var(--border)">
            <div class="card-hd-title" style="font-size:12px;margin-bottom:10px">Today's GRN Log</div>
            ${grnLog.length === 0
              ? `<div style="color:var(--txt2);font-size:11px;padding:8px 0">No GRNs logged yet</div>`
              : grnLog.map(a => `
                <div class="feed-item" style="padding:8px 0">
                  <div class="feed-dot" style="background:var(--green)"></div>
                  <div class="feed-body">
                    <div class="feed-title">${esc(a.action)} &middot; ${esc(a.user_name || 'System')}</div>
                    <div class="feed-sub">${esc((a.detail || '').substring(0, 80))}</div>
                  </div>
                  <div class="feed-time">${_rmpFmtTime(a.created_at)}</div>
                </div>
              `).join('')}
          </div>
        </div>

        <!-- Raise GRN Form -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Raise Goods Received Note (GRN)</div>
          </div>
          <div style="padding:18px;display:flex;flex-direction:column;gap:13px">
            <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-field">
                <label class="form-label">Reference / PO #</label>
                <input class="form-input" id="grn-po" placeholder="e.g. REQ-0009"/>
              </div>
              <div class="form-field">
                <label class="form-label">Supplier Name</label>
                <input class="form-input" id="grn-supplier" placeholder="Supplier name"/>
              </div>
              <div class="form-field" style="grid-column:1 / -1">
                <label class="form-label">Material *</label>
                <select class="form-select" id="grn-material">
                  <option value="">-- Select Material --</option>
                  ${_rmpInv.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(_rmpSku(i))})</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Quantity Received *</label>
                <input class="form-input" id="grn-qty" type="number" min="0" step="any" placeholder="e.g. 1000"/>
              </div>
              <div class="form-field">
                <label class="form-label">Delivery Note #</label>
                <input class="form-input" id="grn-dn" placeholder="Supplier DN"/>
              </div>
              <div class="form-field" style="grid-column:1 / -1">
                <label class="form-label">Remarks / Discrepancies</label>
                <textarea class="form-textarea" id="grn-notes" rows="2" placeholder="Any damage, quantity discrepancy or quality note..."></textarea>
              </div>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end">
              <button class="sec-btn" onclick="renderRmReceiving()">Clear</button>
              <button class="primary-btn" style="background:#f59e0b;box-shadow:0 2px 8px rgba(245,158,11,.3)" onclick="submitRmGRN()"><i class="ti ti-check"></i> Submit GRN</button>
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ═══════════════════════════════════════════
   PAGE 4: rm-warehouse
   ═══════════════════════════════════════════ */
async function renderRmWarehouse() {
  setHTML('#page-content', loading());
  try {
    await _rmpLoad();
    const items = _rmpInv;
    const zoneMap = {};
    items.forEach(i => {
      const z = (i.location || 'Unassigned').trim();
      if (!zoneMap[z]) zoneMap[z] = { used: 0, capacity: 20000, items: [] };
      zoneMap[z].used += Number(i.quantity_on_hand || 0);
      zoneMap[z].items.push(i);
    });
    const zones = Object.entries(zoneMap).sort();
    const nearCap = zones.filter(([, z]) => (z.used / z.capacity) > 0.85).length;
    const totalT  = (items.reduce((s, i) => s + Number(i.quantity_on_hand || 0), 0) / 1000).toFixed(1);
    const pendingPutaway = _rmpReqs.filter(r => (r.status || '').toLowerCase() === 'approved').length;

    setHTML('#page-content', `
      <div class="stat-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${_rmpStatCard('ti-building-warehouse', 'rgba(245,158,11,.1)', 'var(--amber)', zones.length, 'Active Zones')}
        ${_rmpStatCard('ti-alert-triangle',     'rgba(239,68,68,.1)',  '#f87171',      nearCap,     'Near Capacity')}
        ${_rmpStatCard('ti-packages',           'rgba(34,197,94,.1)',  'var(--green)', totalT + ' t', 'Total Stored')}
        ${_rmpStatCard('ti-clock',              'rgba(122,133,153,.1)','var(--txt2)',  pendingPutaway, 'Pending Put-away')}
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Warehouse Zone Map</div>
          <span class="card-hd-sub">Raw Materials Warehouse</span>
        </div>
        <div class="zone-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px">
          ${zones.length === 0
            ? `<div style="grid-column:1/-1" class="empty-state"><i class="ti ti-building"></i><p>No zones in use yet</p></div>`
            : zones.map(([name, z]) => {
                const pct = Math.min(100, Math.round((z.used / z.capacity) * 100));
                const color = pct > 85 ? '#f87171' : pct > 60 ? 'var(--amber)' : 'var(--green)';
                return `<div class="zone-card" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer" onclick="goTo('rm-inventory')">
                  <div style="font-size:20px;margin-bottom:8px">${pct > 85 ? '⚠️' : '📦'}</div>
                  <div style="font-size:12.5px;font-weight:700;margin-bottom:3px">${esc(name)}</div>
                  <div style="font-size:10.5px;color:var(--txt2);margin-bottom:10px">${z.items.length} SKUs &middot; ${fmt(z.used)} ${esc(z.items[0]?.unit || 'kg')}</div>
                  <div class="prog"><div class="prog-f" style="width:${pct}%;background:${color}"></div></div>
                  <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--txt2);margin-top:6px">
                    <span>Cap: ${fmt(z.capacity)} kg</span>
                    <span style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:${color}">${pct}%</span>
                  </div>
                </div>`;
              }).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><div class="card-hd-title">Pending Put-Away Tasks</div></div>
        ${_rmpReqs.filter(r => ['approved', 'pending'].includes((r.status || '').toLowerCase())).length === 0
          ? `<div class="empty-state"><i class="ti ti-checks text-green"></i><p>No pending put-away tasks</p></div>`
          : `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Ref</th><th>Material</th><th>Qty</th><th>Source</th><th>Dest. Zone</th><th>Status</th></tr></thead>
            <tbody>
              ${_rmpReqs.filter(r => ['approved', 'pending'].includes((r.status || '').toLowerCase())).slice(0, 6).map(r => {
                const inv = _rmpInv.find(i => Number(i.product_id) === Number(r.product_id));
                return `<tr>
                  <td class="mono">REQ-${esc(String(r.id).padStart(4,'0'))}</td>
                  <td>${esc(inv?.name || '—')}</td>
                  <td>${fmt(r.quantity || 0)}</td>
                  <td>${esc(r.requester_name || '—')}</td>
                  <td>${esc(inv?.location || 'TBD')}</td>
                  <td><span class="pill ${r.status === 'approved' ? 'b' : 'a'}">${esc(r.status || 'pending')}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _rmpStatCard(icon, bg, color, val, label) {
  return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px">
    <div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;background:${bg};color:${color}"><i class="ti ${icon}"></i></div>
    <div><div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;line-height:1">${val}</div><div style="font-size:11px;color:var(--txt2);margin-top:3px">${label}</div></div>
  </div>`;
}

/* ═══════════════════════════════════════════
   Modals + actions
   ═══════════════════════════════════════════ */

function openRmAddMaterial() {
  openModal('Add raw material', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input id="rmpm-name" class="form-input" placeholder="e.g. PET Resin (Grade C)"/></div>
        <div class="form-group"><label class="form-label">Unit</label>
          <select id="rmpm-unit" class="form-select"><option value="kg">kg</option><option value="litre">litre</option><option value="pcs">pcs</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Initial qty</label><input id="rmpm-qty" class="form-input" type="number" min="0" value="0"/></div>
        <div class="form-group"><label class="form-label">Reorder level</label><input id="rmpm-reorder" class="form-input" type="number" min="0" placeholder="100"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Zone</label>
          <select id="rmpm-zone" class="form-select">
            <option value="Warehouse A">Warehouse A</option>
            <option value="Warehouse B">Warehouse B</option>
            <option value="Chemical Store">Chemical Store</option>
            <option value="Packaging Store">Packaging Store</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Unit price (₦)</label><input id="rmpm-price" class="form-input" type="number" min="0" step="any" placeholder="0"/></div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:#f59e0b" onclick="submitRmAddMaterial()"><i class="ti ti-plus"></i> Add</button>
      </div>
    </div>
  `);
}
async function submitRmAddMaterial() {
  const name = $('#rmpm-name')?.value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  try {
    await API.inventory.create({
      name,
      category: 'raw_material',
      unit:         $('#rmpm-unit')?.value || 'kg',
      quantity:     Number($('#rmpm-qty')?.value) || 0,
      reorderLevel: Number($('#rmpm-reorder')?.value) || 10,
      location:     $('#rmpm-zone')?.value || 'Warehouse A',
      unitPrice:    Number($('#rmpm-price')?.value) || 0,
    });
    forceCloseModal(); toast('Material added', 'success'); renderRmInventory();
  } catch (err) { toast(err.message, 'error'); }
}

function openRmReceiveForItem(invId, name) {
  openRmGRN({ invId, productLabel: name });
}

function openRmGRN(prefill) {
  openModal('Receive stock', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material *</label>
          <select id="grnm-item" class="form-select">
            ${_rmpInv.map(i => `<option value="${i.id}" ${(prefill?.invId === i.id || prefill?.productId === i.product_id) ? 'selected' : ''}>${esc(i.name)} (${esc(_rmpSku(i))})</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Qty received *</label><input id="grnm-qty" class="form-input" type="number" min="0" step="any" value="${prefill?.qty || ''}" placeholder="e.g. 500"/></div>
      </div>
      <div class="form-group"><label class="form-label">Delivery / batch note</label><input id="grnm-note" class="form-input" placeholder="e.g. DN-12345"/></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:#f59e0b" onclick="submitRmGRNModal(${prefill?.reqId || 'null'})"><i class="ti ti-check"></i> Confirm receipt</button>
      </div>
    </div>
  `);
}
async function submitRmGRNModal(reqId) {
  const invId = Number($('#grnm-item')?.value);
  const qty   = Number($('#grnm-qty')?.value);
  if (!invId || !qty || qty <= 0) { toast('Pick a material and positive qty', 'error'); return; }
  const item = _rmpInv.find(i => Number(i.id) === invId);
  if (!item) { toast('Material not found', 'error'); return; }
  const note = $('#grnm-note')?.value.trim();
  const newQty = Number(item.quantity_on_hand || 0) + qty;
  try {
    await API.inventory.update(invId, { quantityOnHand: newQty, batchNo: note || `GRN-${Date.now().toString().slice(-6)}` });
    if (reqId) {
      // If a request was being fulfilled, mark it completed
      try { await API.requests.complete(reqId); } catch {}
    }
    forceCloseModal();
    toast(`Received ${fmt(qty)} ${item.unit || 'kg'} of ${item.name}`, 'success');
    if (App.page === 'rm-receiving') renderRmReceiving();
    else if (App.page === 'rm-inventory') renderRmInventory();
    else renderRmDash();
  } catch (err) { toast(err.message, 'error'); }
}

async function submitRmGRN() {
  const invId = Number($('#grn-material')?.value);
  const qty   = Number($('#grn-qty')?.value);
  if (!invId || !qty || qty <= 0) { toast('Pick a material and quantity', 'error'); return; }
  const item = _rmpInv.find(i => Number(i.id) === invId);
  if (!item) { toast('Material not found', 'error'); return; }
  const dn = $('#grn-dn')?.value.trim();
  const newQty = Number(item.quantity_on_hand || 0) + qty;
  try {
    await API.inventory.update(invId, { quantityOnHand: newQty, batchNo: dn || `GRN-${Date.now().toString().slice(-6)}` });
    toast(`GRN logged · ${fmt(qty)} ${item.unit || 'kg'} ${item.name}`, 'success');
    renderRmReceiving();
  } catch (err) { toast(err.message, 'error'); }
}

function openRmAdjustItem(invId) {
  const item = _rmpInv.find(i => Number(i.id) === invId);
  if (!item) return;
  openModal(`Adjust ${item.name}`, `
    <div class="form-section">
      <div class="req-info"><i class="ti ti-info-circle"></i><span>Current: ${fmt(item.quantity_on_hand)} ${esc(item.unit || 'kg')}</span></div>
      <div class="form-group"><label class="form-label">New quantity on hand</label><input id="rmpa-qty" class="form-input" type="number" min="0" step="any" value="${item.quantity_on_hand}"/></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:#f59e0b" onclick="submitRmAdjust(${invId})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}
async function submitRmAdjust(invId) {
  const q = Number($('#rmpa-qty')?.value);
  if (isNaN(q) || q < 0) { toast('Enter a valid quantity', 'error'); return; }
  try {
    await API.inventory.update(invId, { quantityOnHand: q });
    forceCloseModal(); toast('Adjusted', 'success'); renderRmInventory();
  } catch (err) { toast(err.message, 'error'); }
}

async function rmApproveRequest(id) {
  try { await API.requests.approve(id); toast('Approved', 'success'); renderRmReceiving(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}
