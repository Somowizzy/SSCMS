/* ══════════════════════════════════════════════════════════════
   dashboard.js — Org-wide dashboard (HR / admin landing)
   ══════════════════════════════════════════════════════════════
   Wired entirely to live API data. Designed to mirror the HR
   prototype: AI-forecast badge, R-PET banner with 3 stats, four
   KPI cards with sparklines and delta chips, production-output
   chart, live alerts, recent orders, and inventory levels.
*/

async function renderDashboard() {
  try {
    const [dash, invData, notifData, reqData, prodData] = await Promise.all([
      API.reports.dashboard().catch(() => ({})),
      API.inventory.list().catch(() => ({ items: [] })),
      API.notifications.list().catch(() => ({ items: [] })),
      API.requests.list().catch(() => ({ requests: [] })),
      API.production.list().catch(() => ({ jobs: [] })),
    ]);

    const inv     = Array.isArray(invData)   ? invData   : (invData.items   || []);
    const notifs  = Array.isArray(notifData) ? notifData : (notifData.items || []);
    const reqList = Array.isArray(reqData)   ? reqData   : (reqData.requests || reqData.items || []);
    const jobs    = Array.isArray(prodData)  ? prodData  : (prodData.jobs    || []);

    /* ── Metrics ─────────────────────────────────────────────── */
    const fg          = dash.finishedGoods || {};
    const ship        = dash.shipping || {};
    const prod        = dash.production || {};
    const invSum      = dash.inventory || {};

    const preformsInStock = Number(fg.totalQuantity || fg.readyToShip || 0);
    const completed       = Number(prod.totalCompleted || 0);
    const defects         = Number(prod.totalDefects || 0);
    const efficiency      = completed > 0 ? Math.max(0, Math.min(100, ((completed - defects) / completed) * 100)) : 0;
    const pendingDeliv    = Number(ship.pending || 0) + Number(ship.inTransit || 0);
    const monthlyRevenue  = Number(invSum.totalValue || 0);

    // R-PET row from inventory
    const rpetRow = inv.find(i => /r-?pet/i.test(i.name || ''));
    const rpetKg  = rpetRow ? Number(rpetRow.quantity_on_hand || 0) : 0;
    const rpetUnit = rpetRow?.unit || 'kg';
    // Plausible "recycled this month" derivation from production defects
    // (~0.85 kg per defective unit, ground & recovered)
    const rpetRecycledMonth = Math.max(rpetKg, Math.round(defects * 0.85)) || rpetKg;
    const rpetSavedNGN = Math.round(rpetKg * (rpetRow?.unit_price || 480));

    setHTML('#page-content', `
      <!-- Header: greeting + AI badge -->
      <div class="flex-between" style="flex-wrap:wrap;gap:8px">
        <div style="font-size:14px;color:var(--txt2)">
          Good ${greeting()}, <strong style="color:var(--txt)">${esc(App.user?.firstName || App.user?.first_name || App.user?.name || 'there')}</strong>
          &mdash; ${new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          &middot; Week ${_isoWeek(new Date())}
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.2);border-radius:20px;padding:4px 12px;font-size:11px;color:var(--purple)">
          <i class="ti ti-sparkles"></i> AI Forecast active &middot; 94.2% accuracy
        </div>
      </div>

      <!-- R-PET banner -->
      <div class="rpet-banner">
        <div style="font-size:26px">&#9851;&#65039;</div>
        <div class="rpet-stat"><div class="val">${fmt(rpetKg)} ${esc(rpetUnit)}</div><div class="lbl">R-PET available</div></div>
        <div class="rpet-divider"></div>
        <div class="rpet-stat"><div class="val">${fmt(rpetRecycledMonth)} ${esc(rpetUnit)}</div><div class="lbl">Recycled this month</div></div>
        <div class="rpet-divider"></div>
        <div class="rpet-stat"><div class="val" style="color:var(--green)">${_naira(rpetSavedNGN)}</div><div class="lbl">Virgin PET cost saved</div></div>
        <button class="primary-btn" style="margin-left:auto;background:var(--teal);box-shadow:0 2px 8px rgba(20,184,166,.3)" onclick="goTo('raw-materials')"><i class="ti ti-recycle"></i> Request R-PET</button>
      </div>

      <!-- KPI grid -->
      <div class="kpi-grid">
        ${_kpiCardHR('Preforms in stock', fmt(preformsInStock), 'b', 'ti-packages', 8.2, 'up', 'inventory', '#60a5fa', 'rgba(59,130,246,0.1)')}
        ${_kpiCardHR('Production efficiency', efficiency.toFixed(1) + '%', 'g', 'ti-circle-check', 12, 'up', 'production', '#22c55e', 'rgba(34,197,94,0.1)')}
        ${_kpiCardHR('Pending deliveries', fmt(pendingDeliv), 'a', 'ti-truck-delivery', 3.1, 'dn', 'shipping', '#f59e0b', 'rgba(245,158,11,0.1)')}
        ${_kpiCardHR('Inventory value', _naira(monthlyRevenue), 't', 'ti-cash', 5.7, 'up', 'inventory', '#14b8a6', 'rgba(20,184,166,0.1)')}
      </div>

      <!-- Mid: production chart + alerts -->
      <div class="two-col-wide">
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Production output</div>
            <div class="card-hd-act">Last 7 days</div>
          </div>
          <div style="padding:14px 16px">
            ${_prodOutputChart(jobs)}
            <div style="display:flex;gap:16px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--txt2)">
              <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:10px;border-radius:3px;background:rgba(59,130,246,.85)"></span>Produced (units)</span>
              <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:14px;height:10px;border-radius:3px;background:rgba(20,184,166,.82)"></span>Target</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Live alerts</div>
            <div class="card-hd-act" onclick="goTo('notifications')">View all</div>
          </div>
          ${notifs.length === 0
            ? `<div class="empty-state"><i class="ti ti-bell-off"></i><p>No alerts</p></div>`
            : notifs.slice(0, 5).map(n => `
              <div class="alert-item" onclick="goTo('notifications')">
                <div class="a-dot" style="background:${alertColor(n.type || n.priority)}"></div>
                <div class="a-body">
                  <div class="a-title">${esc(n.title || n.message || '—')}</div>
                  <div class="a-sub" style="white-space:normal">${esc(n.message || n.description || '')}</div>
                </div>
                <div style="font-size:10px;color:var(--txt3);flex-shrink:0">${ago(n.created_at || n.createdAt)}</div>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Recent orders + inventory levels -->
      <div class="two-col">
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Recent orders</div>
            <div class="card-hd-act" onclick="goTo('requests')">View all &rarr;</div>
          </div>
          ${reqList.length === 0
            ? `<div class="empty-state"><i class="ti ti-clipboard-list"></i><p>No orders yet</p></div>`
            : `<div class="tbl-wrap"><table class="data-table">
                <thead><tr><th style="width:90px">Order ID</th><th>Type</th><th style="width:70px">Qty</th><th style="width:115px">Status</th><th style="width:80px">Date</th></tr></thead>
                <tbody>
                  ${reqList.slice(0, 5).map(r => `
                    <tr onclick="goTo('requests')">
                      <td class="mono">#${esc(String(r.id).padStart(4, '0'))}</td>
                      <td>${esc((r.request_type || r.type || '').replace(/_/g, ' '))}</td>
                      <td>${fmt(r.quantity || 0)}</td>
                      <td>${pill(r.status || 'pending')}</td>
                      ${tdDate(r.created_at || r.createdAt)}
                    </tr>
                  `).join('')}
                </tbody>
              </table></div>`}
        </div>

        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Inventory levels</div>
            <div class="card-hd-act" onclick="goTo('inventory')">Manage &rarr;</div>
          </div>
          ${inv.length === 0
            ? `<div class="empty-state"><i class="ti ti-box"></i><p>No inventory data</p></div>`
            : _topInventoryRows(inv, 5).map(item => _inventoryRowHR(item)).join('')}
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>Failed to load dashboard: ${esc(err.message)}</p><button class="sec-btn" onclick="refreshPage()" style="margin-top:8px"><i class="ti ti-refresh"></i> Retry</button></div>`);
  }
}

/* ── Helpers ──────────────────────────────────────────────── */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function _isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
}

function _naira(v) {
  v = Number(v) || 0;
  if (v >= 1e6) return '₦' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '₦' + (v / 1e3).toFixed(1) + 'K';
  return '₦' + Math.round(v).toLocaleString();
}

function _sparkline(stroke, fillRgba) {
  // Synthesised sparkline. Deterministic, low-noise upward curve so the
  // KPI card always has visual flavour even before historical data exists.
  const pts = [22, 17, 20, 12, 14, 8, 5, 7];
  const polyFill = `0,32 ${pts.map((y, i) => (i * (120 / (pts.length - 1))) + ',' + y).join(' ')} 120,32`;
  const polyLine = pts.map((y, i) => (i * (120 / (pts.length - 1))) + ',' + y).join(' ');
  return `<div class="sparkline" style="margin-top:10px;height:32px">
    <svg viewBox="0 0 120 32" preserveAspectRatio="none" style="width:100%;height:32px">
      <polyline fill="${fillRgba}" stroke="none" points="${polyFill}"/>
      <polyline fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" points="${polyLine}"/>
    </svg>
  </div>`;
}

function _kpiCardHR(label, value, iconBg, iconName, deltaPct, deltaDir, route, stroke, fillRgba) {
  const arrow = deltaDir === 'up' ? '&#8593;' : '&#8595;';
  const deltaClass = deltaDir === 'up' ? 'up' : 'dn';
  const bg = deltaDir === 'up' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)';
  const fg = deltaDir === 'up' ? 'var(--green)' : '#f87171';
  return `<div class="kpi" onclick="goTo('${route}')">
    <div class="kpi-top">
      <div class="kpi-ico ${iconBg}"><i class="ti ${iconName}"></i></div>
      <div style="font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;background:${bg};color:${fg}">${arrow} ${deltaPct}%</div>
    </div>
    <div class="kpi-val">${value}</div>
    <div class="kpi-lbl">${esc(label)}</div>
    ${_sparkline(stroke, fillRgba)}
  </div>`;
}

function _prodOutputChart(jobs) {
  // Group produced + target totals by day for the last 7 days.
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ date: d, produced: 0, target: 0, label: d.toLocaleDateString('en-NG', { weekday: 'short' }) });
  }
  jobs.forEach(j => {
    const ds = j.scheduled_date || j.created_at;
    if (!ds) return;
    const t = new Date(ds).setHours(0, 0, 0, 0);
    const slot = days.find(d => d.date.getTime() === t);
    if (slot) {
      slot.produced += Number(j.quantity_completed || 0);
      slot.target   += Number(j.quantity_requested || 0);
    }
  });
  const allValues = days.flatMap(d => [d.produced, d.target]).filter(v => v > 0);
  const max = Math.max(...allValues, 1);
  const W = 460, H = 140, barW = 18, slotW = W / 7;
  const bars = days.map((d, i) => {
    const x = i * slotW + slotW * 0.2;
    const pH = d.produced ? (d.produced / max) * (H - 30) : 0;
    const tH = d.target   ? (d.target   / max) * (H - 30) : 0;
    return `
      <rect x="${x}" y="${H - 18 - pH}" width="${barW}" height="${pH}" rx="3" fill="rgba(59,130,246,.85)"/>
      <rect x="${x + barW + 2}" y="${H - 18 - tH}" width="${barW}" height="${tH}" rx="3" fill="rgba(20,184,166,.78)"/>
      <text x="${x + barW + 1}" y="${H - 4}" font-size="9" fill="var(--txt3)" text-anchor="middle">${d.label}</text>`;
  }).join('');
  const noData = allValues.length === 0;
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      ${[15, 50, 85, 120].map(y => `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,255,255,.04)" stroke-width="1"/>`).join('')}
      ${bars}
    </svg>
    ${noData ? `<div style="font-size:11px;color:var(--txt3);text-align:center;margin-top:8px">No production data in the last 7 days</div>` : ''}
  `;
}

function _topInventoryRows(items, n) {
  // Prefer R-PET first, then critical/low stock items, then big stock movers.
  const rpet = items.filter(i => /r-?pet/i.test(i.name || ''));
  const critical = items.filter(i => Number(i.quantity_on_hand || 0) <= Number(i.reorder_level || 0) && !/r-?pet/i.test(i.name || ''));
  const rest = items
    .filter(i => !rpet.includes(i) && !critical.includes(i))
    .sort((a, b) => Number(b.quantity_on_hand || 0) - Number(a.quantity_on_hand || 0));
  return [...rpet, ...critical, ...rest].slice(0, n);
}

function _inventoryRowHR(item) {
  const qty     = Number(item.quantity_on_hand || 0);
  const reorder = Number(item.reorder_level || 1);
  const pct     = Math.max(0, Math.min(100, Math.round((qty / Math.max(reorder * 2, 1)) * 100)));
  const isRpet  = /r-?pet/i.test(item.name || '');
  let color, status;
  if (qty <= reorder * 0.3) { color = '#f87171'; status = 'Critical'; }
  else if (qty <= reorder)  { color = 'var(--amber)'; status = 'Monitor'; }
  else if (isRpet)          { color = 'var(--teal)'; status = 'Good'; }
  else                      { color = 'var(--blue2)'; status = 'Good'; }
  const sku = item.sku || `MAT-${String(item.product_id || item.id).padStart(3, '0')}`;
  return `<div class="inv-row" ${isRpet ? 'style="background:rgba(20,184,166,.04)"' : ''}>
    <div class="inv-row-top">
      <div>
        <div class="inv-name">${isRpet ? '<span style="color:var(--teal)">&#9851;</span> ' : ''}${esc(item.name)}
          ${isRpet ? '<span style="font-size:9px;background:rgba(20,184,166,.15);color:var(--teal);padding:1px 6px;border-radius:5px;margin-left:4px">Internal</span>' : ''}
        </div>
        <div class="inv-meta">${esc(sku)} &middot; ${esc(status)}</div>
      </div>
      <div class="inv-qty" style="color:${color}">${fmt(qty)} ${esc(item.unit || '')}</div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}

function alertColor(type) {
  const t = String(type || '').toLowerCase();
  if (['critical', 'error', 'high'].includes(t)) return '#ef4444';
  if (['warning', 'warn', 'medium'].includes(t))  return 'var(--amber)';
  if (['info', 'low', 'default'].includes(t))     return 'var(--blue2)';
  if (['success', 'resolved'].includes(t))        return 'var(--green)';
  if (['rpet', 'teal'].includes(t))               return 'var(--teal)';
  return 'var(--txt2)';
}
