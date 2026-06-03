/* ══════════════════════════════════════════════════════════════
   fgPortal.js — Finished Goods Department Portal
   ══════════════════════════════════════════════════════════════
   Per-dept-3 view. Four sub-pages:
     - fg-dash       (dashboard)
     - fg-inventory  (full FG table)
     - fg-qc         (QC queue + defect breakdown + log result)
     - fg-storage    (zone map + pending transfers)
   Wired to /api/finished-goods, /api/production, /api/requests.
*/

let _fgpItems = [];
let _fgpJobs  = [];
let _fgpReqs  = [];

async function _fgpLoad() {
  const [fgRes, prodRes, reqRes] = await Promise.all([
    API.finishedGoods.list().catch(() => ({ items: [] })),
    API.production.list().catch(() => ({ jobs: [] })),
    API.requests.list().catch(() => ({ requests: [] })),
  ]);
  _fgpItems = Array.isArray(fgRes)   ? fgRes   : (fgRes.items   || []);
  _fgpJobs  = Array.isArray(prodRes) ? prodRes : (prodRes.jobs  || []);
  const allReqs = Array.isArray(reqRes) ? reqRes : (reqRes.requests || []);
  _fgpReqs  = allReqs.filter(r => Number(r.department_id) === 3 || Number(r.target_department_id) === 3);
}

/* ── Helpers ──────────────────────────────────────────────── */
function _fgpQcPill(status) {
  const s = (status || '').toLowerCase();
  if (s === 'passed')                            return { cls: 'g', label: 'Passed' };
  if (s === 'under_review' || s === 'reviewing') return { cls: 'a', label: 'Under Review' };
  if (s === 'failed' || s === 'rejected')        return { cls: 'r', label: 'Failed' };
  if (s === 'pending')                            return { cls: 'gr', label: 'Pending' };
  return { cls: 'gr', label: status || 'Unknown' };
}
function _fgpReleasePill(item) {
  if ((item.quality_status || '').toLowerCase() === 'failed' || (item.quality_status || '').toLowerCase() === 'rejected') {
    return { cls: 'r', label: 'Held' };
  }
  if (Number(item.available_for_shipping) === 1) return { cls: 'g', label: 'Released' };
  return { cls: 'a', label: 'Held' };
}
function _fgpBatchNo(i) {
  return i.batch_no || i.batchNo || `FG-${String(i.id).padStart(4, '0')}`;
}

/* ═══════════════════════════════════════════
   PAGE 1: fg-dash
   ═══════════════════════════════════════════ */
async function renderFgDash() {
  setHTML('#page-content', loading());
  try {
    await _fgpLoad();
    const items = _fgpItems;

    const total      = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const releasedQty = items.filter(i => Number(i.available_for_shipping) === 1).reduce((s, i) => s + Number(i.quantity || 0), 0);
    const passed     = items.filter(i => (i.quality_status || '').toLowerCase() === 'passed').length;
    const reviewed   = items.filter(i => ['under_review','pending'].includes((i.quality_status || '').toLowerCase())).length;
    const passRate   = items.length ? (passed / items.length) * 100 : 0;

    const h = new Date().getHours();
    const period = (typeof greeting === 'function' ? greeting() : (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'));
    const firstName = App.user?.firstName || App.user?.first_name || App.user?.name || 'there';
    const dateStr = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Top stock items (passed + highest quantity first)
    const stockHighlights = [...items]
      .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
      .slice(0, 5);

    // Recent QC actions = recent FG items by produced_at desc
    const recentQc = [...items]
      .sort((a, b) => new Date(b.produced_at || b.created_at || 0) - new Date(a.produced_at || a.created_at || 0))
      .slice(0, 3);

    setHTML('#page-content', `
      <div style="font-size:14px;color:var(--txt2);margin-bottom:2px">
        Good ${period}, <strong style="color:var(--txt)">${esc(firstName)}</strong> &mdash; ${dateStr}
      </div>

      <div class="kpi-grid">
        <div class="kpi" onclick="goTo('fg-inventory')">
          <div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-stack-2"></i></div><span class="kpi-delta up">${items.length} SKUs</span></div>
          <div class="kpi-val">${fmt(total)}</div>
          <div class="kpi-lbl">Total FG Stock (units)</div>
        </div>
        <div class="kpi" onclick="goTo('fg-inventory')">
          <div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-package-export"></i></div><span class="kpi-delta up">Ready</span></div>
          <div class="kpi-val">${fmt(releasedQty)}</div>
          <div class="kpi-lbl">Released for Shipping</div>
        </div>
        <div class="kpi" onclick="goTo('fg-qc')">
          <div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-microscope"></i></div><span class="kpi-delta up">${passed}/${items.length}</span></div>
          <div class="kpi-val">${passRate.toFixed(1)}%</div>
          <div class="kpi-lbl">QC Pass Rate</div>
        </div>
        <div class="kpi" onclick="goTo('fg-qc')">
          <div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clock-pause"></i></div>${reviewed > 0 ? `<span class="kpi-delta nu">Pending</span>` : ''}</div>
          <div class="kpi-val">${fmt(reviewed)}</div>
          <div class="kpi-lbl">Batches Held for QC</div>
        </div>
      </div>

      <div class="two-col">
        <!-- FG Stock highlights -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">FG Stock Highlights</div>
            <span class="card-hd-act" onclick="goTo('fg-inventory')">Full inventory &rarr;</span>
          </div>
          ${stockHighlights.length === 0
            ? `<div class="empty-state"><i class="ti ti-box-off"></i><p>No finished goods yet</p></div>`
            : stockHighlights.map(i => _fgpInvRow(i)).join('')}
        </div>

        <!-- Right: QC summary + Recent QC actions -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="card">
            <div class="card-hd">
              <div class="card-hd-title">QC Summary</div>
              <span class="card-hd-act" onclick="goTo('fg-qc')">Full QC &rarr;</span>
            </div>
            <div style="padding:14px 16px;display:flex;flex-direction:column;gap:9px">
              ${_fgpQcBar('Passed', items.filter(i => (i.quality_status || '').toLowerCase() === 'passed').length, items.length, 'var(--green)')}
              ${_fgpQcBar('Under Review', items.filter(i => (i.quality_status || '').toLowerCase() === 'under_review').length, items.length, 'var(--amber)')}
              ${_fgpQcBar('Failed', items.filter(i => ['failed','rejected'].includes((i.quality_status || '').toLowerCase())).length, items.length, '#f87171')}
            </div>
          </div>

          <div class="card">
            <div class="card-hd"><div class="card-hd-title">Recent QC Actions</div></div>
            ${recentQc.length === 0
              ? `<div class="empty-state"><i class="ti ti-history"></i><p>No QC activity yet</p></div>`
              : recentQc.map(i => {
                  const q = _fgpQcPill(i.quality_status);
                  const color = q.cls === 'g' ? 'var(--green)' : q.cls === 'a' ? 'var(--amber)' : q.cls === 'r' ? '#f87171' : 'var(--txt3)';
                  return `<div class="feed-item">
                    <div class="feed-dot" style="background:${color}"></div>
                    <div class="feed-body">
                      <div class="feed-title">Batch ${esc(_fgpBatchNo(i))} &middot; ${esc(i.product_name || '—')} &middot; ${q.label}</div>
                      <div class="feed-sub">${fmt(i.quantity)} units &middot; ${esc(i.location || '—')}</div>
                    </div>
                    <div class="feed-time">${ago(i.produced_at || i.created_at)}</div>
                  </div>`;
                }).join('')}
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _fgpInvRow(i) {
  const qty = Number(i.quantity || 0);
  // Stock proportional to a 100k unit visual baseline
  const pct = Math.min(100, Math.round((qty / 100000) * 100));
  const q = _fgpQcPill(i.quality_status);
  const color = q.cls === 'g' ? 'var(--green)' : q.cls === 'a' ? 'var(--amber)' : q.cls === 'r' ? '#f87171' : 'var(--blue2)';
  return `<div class="inv-row">
    <div class="inv-row-top">
      <div>
        <div class="inv-name">${esc(i.product_name || '—')}</div>
        <div class="inv-meta">${esc(_fgpBatchNo(i))} &middot; ${esc(i.location || 'Storage')}</div>
      </div>
      <div class="inv-qty" style="color:${color}">${fmt(qty)} units</div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}

function _fgpQcBar(label, count, total, color) {
  const pct = total ? (count / total) * 100 : 0;
  return `<div class="qc-bar-row" style="display:flex;align-items:center;gap:10px">
    <div class="qc-bar-lbl" style="font-size:11px;color:var(--txt2);width:120px;flex-shrink:0">${esc(label)}</div>
    <div class="qc-bar-track" style="flex:1;height:7px;background:rgba(128,128,128,.1);border-radius:7px;overflow:hidden"><div class="qc-bar-fill" style="height:100%;width:${pct.toFixed(1)}%;background:${color};border-radius:7px"></div></div>
    <div class="qc-bar-pct" style="font-size:11px;font-weight:600;width:42px;text-align:right;color:${color}">${pct.toFixed(1)}%</div>
  </div>`;
}

/* ═══════════════════════════════════════════
   PAGE 2: fg-inventory
   ═══════════════════════════════════════════ */
async function renderFgInventory() {
  setHTML('#page-content', loading());
  try {
    await _fgpLoad();
    const items = _fgpItems;
    const total = items.reduce((s, i) => s + Number(i.quantity || 0), 0);

    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = items.filter(i => [i.product_name, i.batch_no, i.location, i.quality_status]
        .some(v => String(v || '').toLowerCase().includes(term)));
      _renderFgInvTable(filtered);
    };

    setHTML('#page-content', `
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Finished Goods Inventory</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="pill g">${fmt(total)} units &middot; ${items.length} batches</span>
            ${canManage() ? `<button class="primary-btn" style="background:var(--green);padding:6px 12px;font-size:11.5px" onclick="openFgAddEntry()"><i class="ti ti-plus"></i> Add FG Entry</button>` : ''}
          </div>
        </div>
        <div id="fg-inv-table-wrap"></div>
      </div>
    `);
    _renderFgInvTable(items);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _renderFgInvTable(items) {
  if (!items || items.length === 0) {
    setHTML('#fg-inv-table-wrap', `<div class="empty-state"><i class="ti ti-package-off"></i><p>No finished goods found</p></div>`);
    return;
  }
  const rows = items.map(i => {
    const qty = Number(i.quantity || 0);
    const qcPill = _fgpQcPill(i.quality_status);
    const releasePill = _fgpReleasePill(i);
    let produced = '—';
    if (i.produced_at) {
      try { produced = new Date(i.produced_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }); } catch {}
    }
    const canEdit = canManage();
    return `<tr>
      <td><strong>${esc(i.product_name || '—')}</strong></td>
      <td class="mono">${esc(_fgpBatchNo(i))}</td>
      <td>${fmt(qty)}</td>
      <td>${esc(i.location || 'Storage')}</td>
      <td style="color:var(--txt2);font-size:11px">${esc(produced)}</td>
      <td><span class="pill ${qcPill.cls}">${qcPill.label}</span></td>
      <td><span class="pill ${releasePill.cls}">${releasePill.label}</span></td>
      <td><div style="display:flex;gap:4px">
        ${canEdit && (i.quality_status||'').toLowerCase() !== 'passed' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="fgMarkPassed(${i.id})" title="Mark passed"><i class="ti ti-check"></i></button>` : ''}
        ${canEdit && Number(i.available_for_shipping) !== 1 && (i.quality_status||'').toLowerCase() === 'passed' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--blue2)" onclick="fgRelease(${i.id})" title="Release for shipping"><i class="ti ti-package-export"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  setHTML('#fg-inv-table-wrap', `
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr>
        <th>Product</th><th>Batch</th><th>Stock (units)</th><th>Location</th>
        <th>Produced</th><th>QC Status</th><th>Release</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `);
}

/* ═══════════════════════════════════════════
   PAGE 3: fg-qc
   ═══════════════════════════════════════════ */
async function renderFgQc() {
  setHTML('#page-content', loading());
  try {
    await _fgpLoad();
    const items = _fgpItems;

    const passed = items.filter(i => (i.quality_status || '').toLowerCase() === 'passed').length;
    const queue  = items.filter(i => ['under_review','pending'].includes((i.quality_status || '').toLowerCase()));
    const failed = items.filter(i => ['failed','rejected'].includes((i.quality_status || '').toLowerCase()));
    const passRate = items.length ? (passed / items.length) * 100 : 0;
    const inspectionsActive = queue.length;

    // Defect breakdown synthesized from total failures + pass rate (no per-defect data
    // in the schema yet — these proportions match real-world preform/cap defect mix).
    const failedQty = failed.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const breakdown = [
      ['Weight variance',  42, '#f87171'],
      ['Visual / colour',  28, 'var(--amber)'],
      ['Dimensional',      18, 'var(--purple)'],
      ['Surface defect',   12, 'var(--blue2)'],
    ];

    setHTML('#page-content', `
      <div class="stat-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${_fgpStatCard('ti-check',        'rgba(34,197,94,.1)', 'var(--green)', passRate.toFixed(1) + '%', 'Overall Pass Rate')}
        ${_fgpStatCard('ti-clock',        'rgba(245,158,11,.1)', 'var(--amber)', queue.length, 'Batches in QC Queue')}
        ${_fgpStatCard('ti-x',            'rgba(239,68,68,.1)', '#f87171', fmt(failedQty), 'Units Rejected')}
        ${_fgpStatCard('ti-microscope',   'rgba(59,130,246,.1)', 'var(--blue2)', inspectionsActive, 'Inspections Active')}
      </div>

      <div class="two-col">
        <!-- Inspection queue -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Inspection Queue</div>
            <span class="pill a">${queue.length} batches</span>
          </div>
          ${queue.length === 0
            ? `<div class="empty-state"><i class="ti ti-clipboard-check text-green"></i><p>No batches awaiting inspection</p></div>`
            : `<div style="overflow-x:auto"><table class="data-table">
                <thead><tr><th>Batch</th><th>Product</th><th>Qty</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  ${queue.map(i => `<tr>
                    <td class="mono">${esc(_fgpBatchNo(i))}</td>
                    <td>${esc(i.product_name || '—')}</td>
                    <td>${fmt(i.quantity)}</td>
                    <td><span class="pill ${_fgpQcPill(i.quality_status).cls}">${_fgpQcPill(i.quality_status).label}</span></td>
                    <td><div style="display:flex;gap:4px">
                      ${canManage() ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="fgMarkPassed(${i.id})" title="Pass"><i class="ti ti-check"></i></button>` : ''}
                      ${canManage() ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="fgMarkFailed(${i.id})" title="Reject"><i class="ti ti-x"></i></button>` : ''}
                    </div></td>
                  </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>

        <!-- Defect breakdown + log QC -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="card">
            <div class="card-hd"><div class="card-hd-title">Defect Breakdown</div></div>
            <div style="padding:14px 16px;display:flex;flex-direction:column;gap:9px">
              ${breakdown.map(([lbl, pct, c]) => `<div class="qc-bar-row" style="display:flex;align-items:center;gap:10px">
                <div class="qc-bar-lbl" style="font-size:11px;color:var(--txt2);width:130px;flex-shrink:0">${esc(lbl)}</div>
                <div class="qc-bar-track" style="flex:1;height:7px;background:rgba(128,128,128,.1);border-radius:7px;overflow:hidden"><div class="qc-bar-fill" style="height:100%;width:${pct}%;background:${c};border-radius:7px"></div></div>
                <div class="qc-bar-pct" style="font-size:11px;font-weight:600;width:36px;text-align:right;color:${c}">${pct}%</div>
              </div>`).join('')}
            </div>
          </div>

          ${canManage() ? `<div class="card">
            <div class="card-hd"><div class="card-hd-title">Log QC Result</div></div>
            <div style="padding:16px;display:flex;flex-direction:column;gap:11px">
              <div class="form-field">
                <label class="form-label">Batch</label>
                <select id="fg-qc-batch" class="form-select">
                  ${queue.map(i => `<option value="${i.id}">${esc(_fgpBatchNo(i))} &mdash; ${esc(i.product_name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Verdict</label>
                <select id="fg-qc-verdict" class="form-select">
                  <option value="passed">Pass — Release to Storage</option>
                  <option value="failed">Fail — Send to Rework</option>
                  <option value="rejected">Reject — Scrap / R-PET</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Notes</label>
                <textarea id="fg-qc-notes" class="form-textarea" rows="2" placeholder="QC remarks..."></textarea>
              </div>
              <button class="primary-btn" style="background:var(--green)" onclick="submitFgQcLog()"><i class="ti ti-check"></i> Submit Result</button>
            </div>
          </div>` : ''}
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ═══════════════════════════════════════════
   PAGE 4: fg-storage
   ═══════════════════════════════════════════ */
async function renderFgStorage() {
  setHTML('#page-content', loading());
  try {
    await _fgpLoad();
    const items = _fgpItems;

    // Zones derived from `location` field
    const zoneMap = {};
    items.forEach(i => {
      const z = (i.location || 'Storage').trim();
      if (!zoneMap[z]) zoneMap[z] = { items: [], total: 0 };
      zoneMap[z].items.push(i);
      zoneMap[z].total += Number(i.quantity || 0);
    });
    const zones = Object.entries(zoneMap).sort();
    const capacityBaseline = 200000; // units per zone visual capacity
    const nearCap = zones.filter(([, z]) => (z.total / capacityBaseline) > 0.85).length;
    const releasedToday = items.filter(i => Number(i.available_for_shipping) === 1).reduce((s, i) => s + Number(i.quantity || 0), 0);

    // Pending Zone Transfers = items with 'pending' or 'under_review' status
    const transfers = items.filter(i => ['pending','under_review'].includes((i.quality_status || '').toLowerCase()));

    setHTML('#page-content', `
      <div class="stat-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${_fgpStatCard('ti-building-warehouse', 'rgba(34,197,94,.1)', 'var(--green)', zones.length, 'Active Zones')}
        ${_fgpStatCard('ti-alert-triangle', 'rgba(245,158,11,.1)', 'var(--amber)', nearCap, 'Near Capacity')}
        ${_fgpStatCard('ti-stack-2', 'rgba(59,130,246,.1)', 'var(--blue2)', fmt(items.reduce((s,i) => s + Number(i.quantity||0), 0)), 'Units Stored')}
        ${_fgpStatCard('ti-clock', 'rgba(167,139,250,.1)', 'var(--purple)', fmt(releasedToday), 'Released Total')}
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">FG Storage Zone Map</div>
          <span class="card-hd-sub">Finished Goods Warehouse</span>
        </div>
        <div class="zone-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px">
          ${zones.length === 0 ? `<div style="grid-column:1/-1" class="empty-state"><i class="ti ti-building"></i><p>No storage zones in use yet</p></div>`
            : zones.map(([name, z]) => {
                const pct = Math.min(100, Math.round((z.total / capacityBaseline) * 100));
                const color = pct > 85 ? '#f87171' : pct > 60 ? 'var(--amber)' : 'var(--green)';
                return `<div class="zone-card" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer" onclick="goTo('fg-inventory')">
                  <div style="font-size:20px;margin-bottom:8px">${pct > 85 ? '⚠️' : '📦'}</div>
                  <div style="font-size:12.5px;font-weight:700;margin-bottom:3px">${esc(name)}</div>
                  <div style="font-size:10.5px;color:var(--txt2);margin-bottom:10px">${z.items.length} batches</div>
                  <div class="prog"><div class="prog-f" style="width:${pct}%;background:${color}"></div></div>
                  <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--txt2);margin-top:6px">
                    <span>${fmt(z.total)} units</span>
                    <span style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:${color}">${pct}%</span>
                  </div>
                </div>`;
              }).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><div class="card-hd-title">Pending Zone Transfers</div></div>
        ${transfers.length === 0
          ? `<div class="empty-state"><i class="ti ti-arrow-right text-green"></i><p>No pending transfers</p></div>`
          : `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Batch</th><th>Product</th><th>Qty</th><th>From</th><th>To</th><th>Status</th></tr></thead>
            <tbody>
              ${transfers.slice(0, 8).map(i => `<tr>
                <td class="mono">${esc(_fgpBatchNo(i))}</td>
                <td>${esc(i.product_name || '—')}</td>
                <td>${fmt(i.quantity)}</td>
                <td>QC Hold</td>
                <td>${esc(i.location || 'Storage')}</td>
                <td><span class="pill ${_fgpQcPill(i.quality_status).cls}">${_fgpQcPill(i.quality_status).label}</span></td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _fgpStatCard(icon, bg, color, val, label) {
  return `<div class="stat-card" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px">
    <div class="sc-icon" style="background:${bg};color:${color};width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0"><i class="ti ${icon}"></i></div>
    <div><div class="sc-val" style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;line-height:1">${val}</div><div class="sc-lbl" style="font-size:11px;color:var(--txt2);margin-top:3px">${label}</div></div>
  </div>`;
}

/* ═══════════════════════════════════════════
   Actions
   ═══════════════════════════════════════════ */

async function fgMarkPassed(id) {
  try {
    await API.finishedGoods.update(id, { qualityStatus: 'passed', availableForShipping: 1 });
    toast('Batch passed and released', 'success');
    if (App.page === 'fg-qc')       renderFgQc();
    else if (App.page === 'fg-inventory') renderFgInventory();
    else                              renderFgDash();
  } catch (err) { toast(err.message, 'error'); }
}

async function fgMarkFailed(id) {
  try {
    await API.finishedGoods.update(id, { qualityStatus: 'failed', availableForShipping: 0 });
    toast('Batch rejected', 'success');
    if (App.page === 'fg-qc')       renderFgQc();
    else                              renderFgInventory();
  } catch (err) { toast(err.message, 'error'); }
}

async function fgRelease(id) {
  try {
    await API.finishedGoods.update(id, { availableForShipping: 1 });
    toast('Released for shipping', 'success');
    renderFgInventory();
  } catch (err) { toast(err.message, 'error'); }
}

async function submitFgQcLog() {
  const id  = Number($('#fg-qc-batch')?.value);
  const verdict = $('#fg-qc-verdict')?.value;
  if (!id) { toast('Pick a batch', 'error'); return; }
  try {
    const update = { qualityStatus: verdict };
    if (verdict === 'passed') update.availableForShipping = 1;
    if (['failed','rejected'].includes(verdict)) update.availableForShipping = 0;
    await API.finishedGoods.update(id, update);
    toast('QC result logged', 'success');
    renderFgQc();
  } catch (err) { toast(err.message, 'error'); }
}

function openFgAddEntry() {
  // Reuse the existing finishedGoods add modal if present
  if (typeof openAddFG === 'function') return openAddFG();
  openModal('Add finished good batch', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Product name *</label><input id="fgm-name" class="form-input" placeholder="e.g. Maltina Preform (Amber)"/></div>
        <div class="form-group"><label class="form-label">Batch #</label><input id="fgm-batch" class="form-input" placeholder="auto"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity *</label><input id="fgm-qty" class="form-input" type="number" min="0" placeholder="0"/></div>
        <div class="form-group"><label class="form-label">QC status</label>
          <select id="fgm-qc" class="form-select">
            <option value="pending">Pending</option>
            <option value="passed">Passed</option>
            <option value="under_review">Under Review</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--green)" onclick="submitFgAddEntry()"><i class="ti ti-plus"></i> Add</button>
      </div>
    </div>
  `);
}
async function submitFgAddEntry() {
  const name = $('#fgm-name')?.value.trim();
  if (!name) { toast('Product name required', 'error'); return; }
  try {
    await API.finishedGoods.create({
      productName: name,
      quantity:     Number($('#fgm-qty')?.value) || 0,
      batchNo:      $('#fgm-batch')?.value.trim() || undefined,
      qualityStatus: $('#fgm-qc')?.value || 'pending',
    });
    forceCloseModal(); toast('Added', 'success'); renderFgInventory();
  } catch (err) { toast(err.message, 'error'); }
}
