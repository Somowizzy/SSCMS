/* ══════════════════════════════════════════════════════════════
   shipPortal.js — Shipping Department Portal
   ══════════════════════════════════════════════════════════════
   Per-dept-4 view. Four sub-pages:
     - ship-dash       (dashboard)
     - ship-manifests  (full manifests table)
     - ship-schedule   (today + tomorrow timeline)
     - ship-dispatch   (dispatch queue + assignment + actions)
   Wired to /api/shipping (live) + /api/finished-goods for ready-to-ship.
*/

let _shippAll  = [];
let _shippFG   = [];

async function _shippLoad() {
  const [shipRes, fgRes] = await Promise.all([
    API.shipping.list().catch(() => ({ items: [] })),
    API.finishedGoods.list().catch(() => ({ items: [] })),
  ]);
  _shippAll = Array.isArray(shipRes) ? shipRes : (shipRes.items || shipRes.shipments || []);
  _shippFG  = Array.isArray(fgRes)   ? fgRes   : (fgRes.items   || []);
}

/* ── Helpers ──────────────────────────────────────────────── */
function _shippStatus(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered')                    return { cls: 'g', label: 'Delivered' };
  if (s === 'in_transit' || s === 'in-transit' || s === 'dispatched') return { cls: 'b', label: 'In Transit' };
  if (s === 'scheduled')                     return { cls: 'a', label: 'Scheduled' };
  if (s === 'pending')                       return { cls: 'a', label: 'Pending' };
  if (s === 'cancelled')                     return { cls: 'r', label: 'Cancelled' };
  return { cls: 'gr', label: status || 'Unknown' };
}
function _shippIsToday(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(d)) return false;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return d.getTime() >= t.getTime() && d.getTime() < t.getTime() + 86400000;
}
function _shippDriverInitials(name) {
  if (!name) return '—';
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

/* ═══════════════════════════════════════════
   PAGE 1: ship-dash
   ═══════════════════════════════════════════ */
async function renderShipDash() {
  setHTML('#page-content', loading());
  try {
    await _shippLoad();
    const ships = _shippAll;

    const shipmentsToday = ships.filter(s => _shippIsToday(s.scheduled_pickup) || _shippIsToday(s.actual_pickup)).length;
    const inTransit      = ships.filter(s => ['in_transit','dispatched'].includes((s.status || '').toLowerCase())).length;
    const deliveredToday = ships.filter(s => (s.status || '').toLowerCase() === 'delivered' && _shippIsToday(s.delivery_date)).length;
    const pendingDisp    = ships.filter(s => ['pending','scheduled'].includes((s.status || '').toLowerCase())).length;

    const h = new Date().getHours();
    const period = (typeof greeting === 'function' ? greeting() : (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'));
    const firstName = App.user?.firstName || App.user?.first_name || App.user?.name || 'there';
    const dateStr = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Today's manifests = scheduled today + delivered today, sorted by time
    const todayMans = ships
      .filter(s => _shippIsToday(s.scheduled_pickup) || _shippIsToday(s.actual_pickup) || _shippIsToday(s.delivery_date))
      .sort((a, b) => new Date(a.scheduled_pickup || 0) - new Date(b.scheduled_pickup || 0))
      .slice(0, 5);
    const fallbackMans = ships
      .filter(s => !todayMans.includes(s))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const manifests = todayMans.length > 0 ? todayMans : fallbackMans.slice(0, 5);

    // Fleet = group by carrier as proxy
    const carriers = {};
    ships.forEach(s => {
      const c = s.carrier || 'Unassigned';
      if (!carriers[c]) carriers[c] = { count: 0, latest: null };
      carriers[c].count++;
      if (!carriers[c].latest || new Date(s.scheduled_pickup || 0) > new Date(carriers[c].latest.scheduled_pickup || 0)) {
        carriers[c].latest = s;
      }
    });

    setHTML('#page-content', `
      <div style="font-size:14px;color:var(--txt2);margin-bottom:2px">
        Good ${period}, <strong style="color:var(--txt)">${esc(firstName)}</strong> &mdash; ${dateStr}
      </div>

      <div class="kpi-grid">
        <div class="kpi" onclick="goTo('ship-manifests')">
          <div class="kpi-top"><div class="kpi-ico p"><i class="ti ti-truck-delivery"></i></div><span class="kpi-delta up">Today</span></div>
          <div class="kpi-val">${fmt(shipmentsToday)}</div>
          <div class="kpi-lbl">Shipments Today</div>
        </div>
        <div class="kpi" onclick="goTo('ship-schedule')">
          <div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-map-pin"></i></div><span class="kpi-delta nu">Live</span></div>
          <div class="kpi-val">${fmt(inTransit)}</div>
          <div class="kpi-lbl">In Transit</div>
        </div>
        <div class="kpi" onclick="goTo('ship-manifests')">
          <div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-check-circle"></i></div><span class="kpi-delta up">+${deliveredToday}</span></div>
          <div class="kpi-val">${fmt(deliveredToday)}</div>
          <div class="kpi-lbl">Delivered Today</div>
        </div>
        <div class="kpi" onclick="goTo('ship-dispatch')">
          <div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clock-hour-3"></i></div>${pendingDisp > 0 ? `<span class="kpi-delta nu">Awaiting</span>` : ''}</div>
          <div class="kpi-val">${fmt(pendingDisp)}</div>
          <div class="kpi-lbl">Pending Dispatch</div>
        </div>
      </div>

      <div class="two-col-wide">
        <!-- Today's manifests -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">${todayMans.length > 0 ? "Today's Manifests" : 'Recent Manifests'}</div>
            <span class="card-hd-act" onclick="goTo('ship-manifests')">All manifests &rarr;</span>
          </div>
          ${manifests.length === 0
            ? `<div class="empty-state"><i class="ti ti-truck-off"></i><p>No manifests yet</p></div>`
            : manifests.map(s => _shippManifestRow(s)).join('')}
        </div>

        <!-- Fleet status -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="card">
            <div class="card-hd">
              <div class="card-hd-title">Fleet / Carrier Status</div>
              <span class="card-hd-act" onclick="goTo('ship-dispatch')">Dispatch &rarr;</span>
            </div>
            <div style="padding:12px">
              ${Object.keys(carriers).length === 0
                ? `<div class="empty-state"><i class="ti ti-truck"></i><p>No fleet activity</p></div>`
                : Object.entries(carriers).slice(0, 4).map(([carrier, c]) => {
                    const status = _shippStatus(c.latest?.status);
                    const colorBg = status.cls === 'g' ? 'rgba(34,197,94,.1)' : status.cls === 'b' ? 'rgba(59,130,246,.1)' : 'rgba(245,158,11,.1)';
                    const colorFg = status.cls === 'g' ? 'var(--green)' : status.cls === 'b' ? 'var(--blue2)' : 'var(--amber)';
                    return `<div style="display:flex;align-items:center;gap:10px;padding:9px;border-radius:8px;margin-bottom:6px;background:rgba(128,128,128,.02)">
                      <div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${colorBg};color:${colorFg};font-size:11px;font-weight:700">${esc(_shippDriverInitials(carrier))}</div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(carrier)}</div>
                        <div style="font-size:10.5px;color:var(--txt2)">${c.count} manifest${c.count > 1 ? 's' : ''} &middot; latest ${esc(c.latest?.destination || '—')}</div>
                      </div>
                      <span style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:8px;background:${colorBg};color:${colorFg};flex-shrink:0">${status.label}</span>
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

function _shippManifestRow(s) {
  const status = _shippStatus(s.status);
  const bg = status.cls === 'g' ? 'rgba(34,197,94,.1);color:var(--green)' : status.cls === 'b' ? 'rgba(59,130,246,.1);color:var(--blue2)' : 'rgba(245,158,11,.1);color:var(--amber)';
  const icon = status.cls === 'g' ? 'ti-check' : status.cls === 'b' ? 'ti-truck' : 'ti-clock';
  const pickupTime = s.actual_pickup
    ? new Date(s.actual_pickup).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
    : (s.scheduled_pickup ? new Date(s.scheduled_pickup).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
  return `<div class="manifest-row">
    <div class="mr-icon" style="background:${bg.split(';')[0]};color:${bg.split(';')[1].replace('color:','')}"><i class="ti ${icon}"></i></div>
    <div class="mr-info">
      <div class="mr-id">${esc(s.manifest_no || ('MAN-' + s.id))}</div>
      <div class="mr-sub">${esc(s.customer_name || '—')} &middot; ${fmt(s.total_items || 0)} items${s.destination ? ' to ' + esc(s.destination) : ''}</div>
      <div class="mr-meta"><span class="pill ${status.cls}">${status.label}</span><span class="mono">${esc(s.carrier || '—')}</span></div>
    </div>
    <div class="mr-right"><div class="mr-time">${pickupTime}</div><div class="mr-driver">${esc(s.destination || '—')}</div></div>
  </div>`;
}

/* ═══════════════════════════════════════════
   PAGE 2: ship-manifests
   ═══════════════════════════════════════════ */
async function renderShipManifests() {
  setHTML('#page-content', loading());
  try {
    await _shippLoad();
    const ships = _shippAll;

    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = ships.filter(s => [s.manifest_no, s.customer_name, s.destination, s.carrier, String(s.id)]
        .some(v => String(v || '').toLowerCase().includes(term)));
      _renderShipManifestsTable(filtered);
    };

    setHTML('#page-content', `
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Shipment Manifests <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${fmt(ships.length)} total</span></div>
          ${canManage() ? `<button class="primary-btn" style="background:var(--purple);padding:6px 12px;font-size:11.5px" onclick="typeof openAddShipping === 'function' && openAddShipping()"><i class="ti ti-plus"></i> New Manifest</button>` : ''}
        </div>
        <div id="ship-man-table-wrap"></div>
      </div>
    `);
    _renderShipManifestsTable(ships);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _renderShipManifestsTable(ships) {
  if (!ships || ships.length === 0) {
    setHTML('#ship-man-table-wrap', `<div class="empty-state"><i class="ti ti-truck-off"></i><p>No shipments found</p></div>`);
    return;
  }
  const rows = ships.map(s => {
    const status = _shippStatus(s.status);
    let dispatch = '—';
    if (s.scheduled_pickup) {
      try { dispatch = new Date(s.scheduled_pickup).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch {}
    }
    return `<tr>
      <td class="mono">${esc(s.manifest_no || ('MAN-' + s.id))}</td>
      <td><strong>${esc(s.customer_name || '—')}</strong></td>
      <td style="color:var(--txt2)">${esc(s.destination || '—')}</td>
      <td>${fmt(s.total_items || 0)}</td>
      <td>${esc(s.carrier || 'Unassigned')}</td>
      <td style="color:var(--txt2);font-size:11px">${esc(dispatch)}</td>
      <td><span class="pill ${status.cls}">${status.label}</span></td>
      <td><div style="display:flex;gap:4px">
        ${canManage() && (s.status || '').toLowerCase() === 'pending' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--blue2)" onclick="shipDispatchOne(${s.id})" title="Dispatch"><i class="ti ti-send"></i></button>` : ''}
        ${canManage() && ['dispatched','in_transit'].includes((s.status || '').toLowerCase()) ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="shipDeliverOne(${s.id})" title="Mark delivered"><i class="ti ti-check"></i></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  setHTML('#ship-man-table-wrap', `
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr>
        <th>Manifest #</th><th>Customer</th><th>Destination</th><th>Items</th>
        <th>Carrier</th><th>Dispatch</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  `);
}

/* ═══════════════════════════════════════════
   PAGE 3: ship-schedule
   ═══════════════════════════════════════════ */
async function renderShipSchedule() {
  setHTML('#page-content', loading());
  try {
    await _shippLoad();
    const ships = _shippAll;

    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);

    const todayShips = ships.filter(s => {
      const t = new Date(s.scheduled_pickup || s.actual_pickup || s.delivery_date || 0).getTime();
      return t >= today.getTime() && t < tomorrow.getTime();
    });
    const tomorrowShips = ships.filter(s => {
      const t = new Date(s.scheduled_pickup || 0).getTime();
      return t >= tomorrow.getTime() && t < dayAfter.getTime();
    });

    setHTML('#page-content', `
      <div class="two-col">
        <!-- Today timeline -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Delivery Schedule &middot; ${today.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div style="padding:18px">
            ${todayShips.length === 0
              ? `<div class="empty-state"><i class="ti ti-calendar-off"></i><p>No deliveries scheduled today</p></div>`
              : todayShips.map(s => _shippTimelineItem(s)).join('')}
          </div>
        </div>

        <!-- Tomorrow preview -->
        <div class="card">
          <div class="card-hd"><div class="card-hd-title">Tomorrow's Schedule Preview</div></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            ${tomorrowShips.length > 0 ? `
            <div class="info-banner blue" style="display:flex;align-items:flex-start;gap:12px;border-radius:10px;padding:10px 13px;font-size:11.5px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);color:var(--blue2)">
              <i class="ti ti-info-circle" style="font-size:16px;flex-shrink:0;margin-top:1px"></i>
              <div>${tomorrowShips.length} ${tomorrowShips.length === 1 ? 'delivery' : 'deliveries'} planned. Ensure drivers and trucks are assigned.</div>
            </div>` : ''}
            ${tomorrowShips.length === 0
              ? `<div class="empty-state"><i class="ti ti-calendar"></i><p>No deliveries planned for tomorrow yet</p></div>`
              : `<div style="overflow-x:auto"><table class="data-table">
                  <thead><tr><th>Time</th><th>Customer</th><th>Destination</th><th>Items</th></tr></thead>
                  <tbody>
                    ${tomorrowShips.map(s => {
                      let time = '—';
                      try { time = new Date(s.scheduled_pickup).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch {}
                      return `<tr>
                        <td>${esc(time)}</td>
                        <td>${esc(s.customer_name || '—')}</td>
                        <td>${esc(s.destination || '—')}</td>
                        <td>${fmt(s.total_items || 0)}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table></div>`}
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _shippTimelineItem(s) {
  const status = (s.status || '').toLowerCase();
  let dotCls = 'pend', icon = 'ti-clock';
  if (status === 'delivered') { dotCls = 'done'; icon = 'ti-check'; }
  else if (['dispatched','in_transit'].includes(status)) { dotCls = 'active'; icon = 'ti-truck'; }
  const dotStyle = dotCls === 'done'   ? 'background:rgba(34,197,94,.15);color:var(--green)'
                  : dotCls === 'active' ? 'background:rgba(59,130,246,.15);color:var(--blue2);box-shadow:0 0 0 4px rgba(59,130,246,.1)'
                  : 'background:rgba(128,128,128,.08);color:var(--txt3)';
  const lineStyle = dotCls === 'done' ? 'background:rgba(34,197,94,.3)' : 'background:var(--border)';
  let timeLine = '';
  if (s.actual_pickup) {
    try { timeLine = `Departed ${new Date(s.actual_pickup).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}`; } catch {}
  }
  if (s.delivery_date && status === 'delivered') {
    try { timeLine += ` &middot; Delivered ${new Date(s.delivery_date).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })} ✓`; } catch {}
  } else if (s.scheduled_pickup && !s.actual_pickup) {
    try { timeLine = `Scheduled ${new Date(s.scheduled_pickup).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}`; } catch {}
  }
  return `<div class="tl-item" style="display:flex;gap:12px;padding-bottom:16px">
    <div class="tl-left" style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:28px">
      <div class="tl-dot ${dotCls}" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;${dotStyle}"><i class="ti ${icon}" style="font-size:12px"></i></div>
      <div class="tl-line ${dotCls === 'done' ? 'done' : ''}" style="width:2px;flex:1;margin-top:4px;${lineStyle}"></div>
    </div>
    <div class="tl-body" style="flex:1;padding-top:4px">
      <div class="tl-title ${dotCls === 'pend' ? 'pend' : ''}" style="font-size:12.5px;font-weight:600;color:${dotCls === 'pend' ? 'var(--txt2)' : 'var(--txt)'}">${esc(s.manifest_no || 'MAN-' + s.id)} &middot; ${esc(s.customer_name || '—')}</div>
      <div class="tl-sub" style="font-size:11px;color:var(--txt2);margin-top:2px">${fmt(s.total_items || 0)} items${s.carrier ? ' &middot; ' + esc(s.carrier) : ''}${s.destination ? ' &middot; to ' + esc(s.destination) : ''}</div>
      <div class="tl-time" style="font-size:10px;color:var(--txt3);margin-top:3px">${timeLine || '—'}</div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════
   PAGE 4: ship-dispatch
   ═══════════════════════════════════════════ */
async function renderShipDispatch() {
  setHTML('#page-content', loading());
  try {
    await _shippLoad();
    const ships = _shippAll;

    const pending = ships.filter(s => ['pending','scheduled'].includes((s.status || '').toLowerCase()));
    const inTransit = ships.filter(s => ['dispatched','in_transit'].includes((s.status || '').toLowerCase())).slice(0, 4);

    const needsAssign = pending.filter(s => !s.carrier || s.carrier.trim() === '');

    setHTML('#page-content', `
      ${needsAssign.length > 0 ? `
      <div class="info-banner amber" style="display:flex;align-items:flex-start;gap:12px;border-radius:10px;padding:13px 16px;font-size:12px;line-height:1.6;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:var(--amber)">
        <i class="ti ti-alert-circle" style="font-size:18px;flex-shrink:0;margin-top:1px"></i>
        <div><strong>Action required:</strong> ${needsAssign.length} manifest${needsAssign.length > 1 ? 's' : ''} need carrier assignment before dispatch.</div>
      </div>` : ''}

      <div class="two-col">
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Dispatch Queue</div>
            <span class="pill a">${pending.length} pending</span>
          </div>
          ${pending.length === 0 && inTransit.length === 0
            ? `<div class="empty-state"><i class="ti ti-truck-loading text-green"></i><p>Queue is clear — nothing waiting to dispatch</p></div>`
            : [...pending, ...inTransit].map(s => {
                const status = _shippStatus(s.status);
                const needsCarrier = !s.carrier || s.carrier.trim() === '';
                const borderStyle = needsCarrier ? 'border-left:3px solid var(--amber)' : '';
                let iconBg, iconCol, iconName;
                if (['dispatched','in_transit'].includes((s.status || '').toLowerCase())) { iconBg = 'rgba(59,130,246,.1)'; iconCol = 'var(--blue2)'; iconName = 'ti-check'; }
                else if (needsCarrier) { iconBg = 'rgba(245,158,11,.1)'; iconCol = 'var(--amber)'; iconName = 'ti-send'; }
                else { iconBg = 'rgba(59,130,246,.1)'; iconCol = 'var(--blue2)'; iconName = 'ti-send'; }
                return `<div class="manifest-row" style="${borderStyle}">
                  <div class="mr-icon" style="background:${iconBg};color:${iconCol}"><i class="ti ${iconName}"></i></div>
                  <div class="mr-info">
                    <div class="mr-id">${esc(s.manifest_no || ('MAN-' + s.id))} <span style="font-size:10px;font-weight:400;color:var(--txt2);margin-left:6px">— ${esc(s.customer_name || '—')}</span></div>
                    <div class="mr-sub">${fmt(s.total_items || 0)} items${s.carrier ? ' &middot; ' + esc(s.carrier) : ''}${s.destination ? ' &middot; ' + esc(s.destination) : ''}</div>
                    <div class="mr-meta">${needsCarrier ? `<span class="pill r">Needs Carrier</span>` : `<span class="pill ${status.cls}">${status.label}</span>`}${s.scheduled_pickup ? `<span class="mono">${new Date(s.scheduled_pickup).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span>` : ''}</div>
                  </div>
                  <div class="mr-right">
                    ${canManage() && (s.status || '').toLowerCase() === 'pending' ? `<button class="primary-btn" style="background:var(--purple);padding:5px 10px;font-size:11px" onclick="shipDispatchOne(${s.id})"><i class="ti ti-send"></i> Dispatch</button>` : ''}
                    ${canManage() && ['dispatched','in_transit'].includes((s.status || '').toLowerCase()) ? `<button class="primary-btn" style="background:var(--green);padding:5px 10px;font-size:11px" onclick="shipDeliverOne(${s.id})"><i class="ti ti-check"></i> Deliver</button>` : ''}
                  </div>
                </div>`;
              }).join('')}
        </div>

        ${canManage() ? `<div class="card">
          <div class="card-hd"><div class="card-hd-title">Assign Carrier &amp; Update</div></div>
          <div style="padding:18px;display:flex;flex-direction:column;gap:13px">
            <div class="form-field">
              <label class="form-label">Manifest *</label>
              <select id="ship-assign-id" class="form-select">
                ${pending.map(s => `<option value="${s.id}">${esc(s.manifest_no || 'MAN-' + s.id)} &mdash; ${esc(s.customer_name || '—')}</option>`).join('')}
              </select>
            </div>
            <div class="form-field">
              <label class="form-label">Carrier / Truck</label>
              <input id="ship-assign-carrier" class="form-input" placeholder="e.g. TransCorp Logistics / LT-291"/>
            </div>
            <div class="form-field">
              <label class="form-label">Destination override (optional)</label>
              <input id="ship-assign-dest" class="form-input" placeholder="City, Nigeria"/>
            </div>
            <div style="display:flex;gap:8px">
              <button class="primary-btn" style="background:var(--purple)" onclick="submitShipAssign()"><i class="ti ti-check"></i> Save assignment</button>
              <button class="primary-btn" style="background:var(--blue)" onclick="submitShipAssignAndDispatch()"><i class="ti ti-send"></i> Save &amp; Dispatch</button>
            </div>
          </div>
        </div>` : ''}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ═══════════════════════════════════════════
   Actions
   ═══════════════════════════════════════════ */
async function shipDispatchOne(id) {
  try { await API.shipping.dispatch(id); toast('Dispatched', 'success'); _refreshShipCurrent(); }
  catch (err) { toast(err.message, 'error'); }
}
async function shipDeliverOne(id) {
  try { await API.shipping.deliver(id); toast('Marked delivered', 'success'); _refreshShipCurrent(); }
  catch (err) { toast(err.message, 'error'); }
}
async function submitShipAssign() {
  const id = Number($('#ship-assign-id')?.value);
  if (!id) { toast('Pick a manifest', 'error'); return; }
  const carrier = $('#ship-assign-carrier')?.value.trim();
  const dest    = $('#ship-assign-dest')?.value.trim();
  const update = {};
  if (carrier) update.carrier = carrier;
  if (dest)    update.destination = dest;
  if (!Object.keys(update).length) { toast('Nothing to update', 'error'); return; }
  try {
    await API.shipping.update(id, update);
    toast('Assignment saved', 'success'); _refreshShipCurrent();
  } catch (err) { toast(err.message, 'error'); }
}
async function submitShipAssignAndDispatch() {
  await submitShipAssign();
  const id = Number($('#ship-assign-id')?.value);
  if (id) await shipDispatchOne(id);
}
function _refreshShipCurrent() {
  if (App.page === 'ship-dispatch')      renderShipDispatch();
  else if (App.page === 'ship-manifests') renderShipManifests();
  else if (App.page === 'ship-schedule')  renderShipSchedule();
  else                                     renderShipDash();
}
