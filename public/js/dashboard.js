async function renderDashboard() {
  try {
    const [dash, invData, notifData, reqs] = await Promise.all([
      API.reports.dashboard().catch(() => ({})),
      API.inventory.list('?limit=5').catch(() => []),
      API.notifications.list().catch(() => []),
      API.requests.list('?limit=5').catch(() => []),
    ]);

    const inv = Array.isArray(invData) ? invData : (invData.items || []);
    const notifs = Array.isArray(notifData) ? notifData : (notifData.items || []);
    const reqList = Array.isArray(reqs) ? reqs : (reqs.items || []);

    // KPI values — adapt field names to whatever your backend returns
    const totalItems    = dash.inventoryCount     || dash.total_inventory     || inv.length   || 0;
    const pendingOrders = dash.pendingRequests     || dash.pending_requests    || 0;
    const activeRuns    = dash.activeProduction    || dash.active_production   || 0;
    const shipped       = dash.shipmentsThisMonth  || dash.shipments_month     || 0;
    const rpetKg        = dash.rpetAvailable       || dash.rpet_available      || 0;
    const rpetRecycled  = dash.rpetRecycledMonth   || dash.rpet_recycled_month || 0;
    const rpetSaved     = dash.rpetCostSaved       || dash.rpet_cost_saved     || 0;

    setHTML('#page-content', `
      <!-- Greeting -->
      <div class="flex-between" style="flex-wrap:wrap;gap:8px">
        <div style="font-size:14px;color:var(--txt2)">
          Good ${greeting()}, <strong style="color:var(--txt)">${esc(App.user?.firstName || App.user?.first_name || App.user?.name || 'there')}</strong>
          &mdash; ${new Date().toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.2);border-radius:20px;padding:4px 12px;font-size:11px;color:var(--purple)">
          <i class="ti ti-activity"></i> System live
        </div>
      </div>

      <!-- R-PET Banner (only show if data available) -->
      ${rpetKg > 0 ? `
      <div class="rpet-banner">
        <div style="font-size:26px">&#9851;&#65039;</div>
        <div class="rpet-stat"><div class="val">${fmtKg(rpetKg)}</div><div class="lbl">R-PET available</div></div>
        <div class="rpet-divider"></div>
        <div class="rpet-stat"><div class="val">${fmtKg(rpetRecycled)}</div><div class="lbl">Recycled this month</div></div>
        ${rpetSaved ? `<div class="rpet-divider"></div><div class="rpet-stat"><div class="val text-green">${fmtM(rpetSaved)}</div><div class="lbl">Virgin material saved</div></div>` : ''}
        <button class="rpet-action" onclick="goTo('inventory')"><i class="ti ti-recycle"></i> View R-PET stock</button>
      </div>` : ''}

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi" onclick="goTo('inventory')">
          <div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-packages"></i></div></div>
          <div class="kpi-val">${fmt(totalItems)}</div>
          <div class="kpi-lbl">Inventory items</div>
        </div>
        <div class="kpi" onclick="goTo('requests')">
          <div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clipboard-list"></i></div></div>
          <div class="kpi-val">${fmt(pendingOrders)}</div>
          <div class="kpi-lbl">Pending orders</div>
        </div>
        <div class="kpi" onclick="goTo('production')">
          <div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-settings-2"></i></div></div>
          <div class="kpi-val">${fmt(activeRuns)}</div>
          <div class="kpi-lbl">Active production runs</div>
        </div>
        <div class="kpi" onclick="goTo('shipping')">
          <div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-truck"></i></div></div>
          <div class="kpi-val">${fmt(shipped)}</div>
          <div class="kpi-lbl">Shipments this month</div>
        </div>
      </div>

      <!-- Mid: Orders + Alerts -->
      <div class="two-col-wide">
        <!-- Recent orders -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Recent orders &amp; requests</div>
            <div class="card-hd-act" onclick="goTo('requests')">View all &rarr;</div>
          </div>
          ${reqList.length === 0
            ? empty('No orders yet', 'ti-clipboard-list')
            : `<div class="tbl-wrap"><table class="data-table">
              <thead><tr><th style="width:90px">ID</th><th>Description</th><th style="width:110px">Status</th><th style="width:90px">Date</th></tr></thead>
              <tbody>
                ${reqList.slice(0,6).map(r => `
                  <tr onclick="goTo('requests')">
                    <td class="mono">#${esc(r.id)}</td>
                    <td>${esc(r.description || r.name || r.title || '—')}</td>
                    <td>${pill(r.status)}</td>
                    ${tdDate(r.created_at || r.createdAt)}
                  </tr>`).join('')}
              </tbody>
            </table></div>`
          }
        </div>

        <!-- Alerts -->
        <div class="card">
          <div class="card-hd">
            <div class="card-hd-title">Live alerts</div>
            <div class="card-hd-act" onclick="goTo('notifications')">View all</div>
          </div>
          ${notifs.length === 0
            ? `<div style="padding:24px;text-align:center;color:var(--txt2);font-size:12px"><i class="ti ti-bell-off" style="font-size:28px;display:block;margin-bottom:8px"></i>No alerts</div>`
            : notifs.slice(0,6).map(n => `
              <div class="alert-item" onclick="goTo('notifications')">
                <div class="a-dot" style="background:${alertColor(n.type || n.priority)}"></div>
                <div class="a-body">
                  <div class="a-title">${esc(n.title || n.message || '—')}</div>
                  <div class="a-sub">${esc(n.message || n.description || '')}</div>
                </div>
                <div class="a-time">${ago(n.created_at || n.createdAt)}</div>
              </div>`).join('')
          }
        </div>
      </div>

      <!-- Inventory snapshot -->
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Inventory snapshot</div>
          <div class="card-hd-act" onclick="goTo('inventory')">Manage stock &rarr;</div>
        </div>
        ${inv.length === 0 ? empty('No inventory data yet', 'ti-box') : inv.slice(0,6).map(item => {
          const qty    = item.quantity || item.qty || 0;
          const minQty = item.min_quantity || item.minQty || item.reorder_point || 0;
          const pct    = minQty ? Math.min(100, (qty / (minQty * 2)) * 100) : 60;
          const color  = pct < 20 ? '#ef4444' : pct < 50 ? 'var(--amber)' : pct < 80 ? 'var(--blue2)' : 'var(--green)';
          const rpet   = item.type === 'rpet' || item.is_rpet || item.material_type === 'R-PET';
          return `
          <div class="inv-row">
            <div class="inv-row-top">
              <div>
                <div class="inv-name">${rpet ? '&#9851; ' : ''}${esc(item.name || item.material_name || item.item_name || '—')}
                  ${rpet ? '<span style="font-size:9px;background:rgba(20,184,166,.15);color:var(--teal);padding:1px 6px;border-radius:5px;margin-left:4px;font-weight:700">R-PET</span>' : ''}
                </div>
                <div class="inv-meta">${esc(item.sku || item.code || item.category || '')} ${item.unit ? '· '+item.unit : ''}</div>
              </div>
              <div class="inv-qty" style="color:${color}">${fmt(qty)} ${item.unit || ''}</div>
            </div>
            ${progBar(pct, color)}
          </div>`;
        }).join('')}
      </div>
    `);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>Failed to load dashboard: ${esc(err.message)}</p><button class="sec-btn" onclick="refreshPage()" style="margin-top:8px"><i class="ti ti-refresh"></i> Retry</button></div>`);
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning'; if (h < 17) return 'afternoon'; return 'evening';
}

function alertColor(type) {
  const t = String(type || '').toLowerCase();
  if (['critical','error','high'].includes(t)) return '#ef4444';
  if (['warning','warn','medium'].includes(t))  return 'var(--amber)';
  if (['info','low'].includes(t))               return 'var(--blue2)';
  if (['success','resolved'].includes(t))       return 'var(--green)';
  if (['rpet','recycling'].includes(t))         return 'var(--teal)';
  return 'var(--txt2)';
}
