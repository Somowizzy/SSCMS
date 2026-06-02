/* ══════════════════════════════════════════
   requests.js — Orders & Requests (HR prototype layout)
   ══════════════════════════════════════════ */
let _reqAll = [];
let _reqFilter = 'all';
let _reqSelectedId = null;

async function renderRequests() {
  setHTML('#page-content', loading());
  try {
    const res = await API.requests.list();
    _reqAll = Array.isArray(res) ? res : (res.requests || res.items || res.data || []);
    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = _reqAll.filter(r =>
        [r.notes, r.description, r.request_type, r.requester_name, String(r.id)]
          .some(v => String(v || '').toLowerCase().includes(term))
      );
      _renderReqTable(_applyStatusFilter(filtered));
    };
    if (!_reqSelectedId && _reqAll[0]) _reqSelectedId = _reqAll[0].id;
    buildReqPage(_reqAll);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* Map an order/request to a coarse progress percentage based on status.
   Pending = 0, Approved = 50, In-progress = 75, Completed/Dispatched = 100,
   Rejected = 0 (red). */
function _reqProgressPct(r) {
  const s = (r.status || '').toLowerCase();
  if (s === 'completed' || s === 'dispatched' || s === 'delivered') return 100;
  if (s === 'in_progress' || s === 'in-progress')                  return 75;
  if (s === 'approved')                                             return 50;
  return 0;
}

/* Map a request status to one of the prototype's five buckets:
   in-production, dispatched, pending, delayed, total. */
function _reqBucket(r) {
  const s = (r.status || '').toLowerCase();
  if (s === 'approved' || s === 'in_progress' || s === 'in-progress') return 'in-production';
  if (s === 'completed' || s === 'dispatched' || s === 'delivered')   return 'dispatched';
  if (s === 'rejected' || s === 'delayed' || s === 'cancelled')       return 'delayed';
  return 'pending';
}

function _applyStatusFilter(items) {
  if (_reqFilter === 'all') return items;
  return items.filter(r => _reqBucket(r) === _reqFilter);
}

function filterReqs(bucket) {
  _reqFilter = bucket;
  // Toggle filter-button active classes
  document.querySelectorAll('#req-filter-row .filter-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.bucket === bucket));
  _renderReqTable(_applyStatusFilter(_reqAll));
}

function buildReqPage(items) {
  const inProd      = items.filter(r => _reqBucket(r) === 'in-production').length;
  const dispatched  = items.filter(r => _reqBucket(r) === 'dispatched').length;
  const pending     = items.filter(r => _reqBucket(r) === 'pending').length;
  const delayed     = items.filter(r => _reqBucket(r) === 'delayed').length;
  // Orders created this week (delta chip)
  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = items.filter(r => new Date(r.created_at || 0).getTime() >= weekAgo).length;

  setHTML('#page-content', `
    <!-- KPIs -->
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">
      <div class="kpi">
        <div class="kpi-val">${fmt(items.length)}</div>
        <div class="kpi-lbl">Total orders</div>
        <div style="display:inline-flex;align-items:center;margin-top:6px;font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;background:rgba(34,197,94,.1);color:var(--green)">&#8593; ${fmt(thisWeek)} this week</div>
      </div>
      <div class="kpi"><div class="kpi-val text-blue">${fmt(inProd)}</div><div class="kpi-lbl">In production</div></div>
      <div class="kpi"><div class="kpi-val text-teal">${fmt(dispatched)}</div><div class="kpi-lbl">Dispatched</div></div>
      <div class="kpi"><div class="kpi-val text-amber">${fmt(pending)}</div><div class="kpi-lbl">Pending</div></div>
      <div class="kpi"><div class="kpi-val text-red">${fmt(delayed)}</div><div class="kpi-lbl">Delayed / Rejected</div></div>
    </div>

    <!-- Toolbar / filters -->
    <div class="toolbar" id="req-filter-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="filter-btn ${_reqFilter==='all'?'on':''}"            data-bucket="all"            onclick="filterReqs('all')">All orders</div>
      <div class="filter-btn ${_reqFilter==='in-production'?'on':''}" data-bucket="in-production" onclick="filterReqs('in-production')">In production</div>
      <div class="filter-btn ${_reqFilter==='dispatched'?'on':''}"    data-bucket="dispatched"    onclick="filterReqs('dispatched')">Dispatched</div>
      <div class="filter-btn ${_reqFilter==='pending'?'on':''}"       data-bucket="pending"       onclick="filterReqs('pending')">Pending</div>
      <div class="filter-btn ${_reqFilter==='delayed'?'on':''}"       data-bucket="delayed"       onclick="filterReqs('delayed')" style="color:#f87171;border-color:rgba(239,68,68,.3)">Delayed</div>
      ${canManage() ? `<button class="primary-btn" style="margin-left:auto" onclick="openAddRequest()"><i class="ti ti-plus"></i> New order</button>` : ''}
    </div>

    <!-- Orders table -->
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">All orders <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${fmt(items.length)} total</span></div>
      </div>
      <div id="req-table"></div>
    </div>

    <!-- Details + Timeline for the selected order -->
    <div class="two-col-wide" id="req-detail-row">
      ${_orderDetailCard(_reqSelectedId)}
      ${_orderTimelineCard(_reqSelectedId)}
    </div>
  `);
  _renderReqTable(_applyStatusFilter(items));
}

function _renderReqTable(items) {
  if (!items.length) { setHTML('#req-table', empty('No orders found', 'ti-clipboard-list')); return; }
  const canApprove = canManage();
  setHTML('#req-table', `
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr>
        <th style="width:90px">Order ID</th>
        <th>Type</th>
        <th style="width:140px">Requested by</th>
        <th style="width:70px">Qty</th>
        <th style="width:130px">Progress</th>
        <th style="width:115px">Status</th>
        <th style="width:80px">Date</th>
        <th style="width:120px">Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const pct = _reqProgressPct(r);
          const bar = pct >= 100 ? 'var(--teal)' : pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--blue2)' : pct > 0 ? 'var(--amber)' : 'var(--txt3)';
          const selected = Number(_reqSelectedId) === Number(r.id);
          return `<tr onclick="selectReq(${r.id})" style="${selected ? 'background:rgba(59,130,246,.05)' : ''}">
            <td class="mono">#${esc(String(r.id).padStart(4, '0'))}</td>
            <td>${esc((r.request_type || r.type || '').replace(/_/g, ' '))}</td>
            <td style="color:var(--txt2)">${esc(r.requester_name || r.requested_by || '—')}</td>
            <td>${fmt(r.quantity || 0)}</td>
            <td>
              <div style="display:inline-flex;align-items:center;gap:8px">
                <div class="prog" style="width:80px"><div class="prog-f" style="width:${pct}%;background:${bar}"></div></div>
                <span style="font-size:10.5px;color:var(--txt2)">${pct}%</span>
              </div>
            </td>
            <td>${pill(r.status || 'pending')}</td>
            ${tdDate(r.created_at || r.createdAt)}
            <td>
              <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
                ${canApprove && (r.status || '').toLowerCase() === 'pending' ? `
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="approveReq(${r.id})" title="Approve"><i class="ti ti-check"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="rejectReq(${r.id})" title="Reject"><i class="ti ti-x"></i></button>` : ''}
                ${canApprove && (r.status || '').toLowerCase() === 'approved' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--blue2)" onclick="completeReq(${r.id})" title="Mark complete"><i class="ti ti-check-all"></i></button>` : ''}
                ${canApprove ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteReq(${r.id})" title="Delete"><i class="ti ti-trash"></i></button>` : ''}
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `);
}

/* ── Selected-order detail + timeline ─────────────────────────── */

function selectReq(id) {
  _reqSelectedId = id;
  const row = $('#req-detail-row');
  if (row) row.innerHTML = _orderDetailCard(id) + _orderTimelineCard(id);
  _renderReqTable(_applyStatusFilter(_reqAll));
}

function _orderDetailCard(id) {
  const r = _reqAll.find(x => Number(x.id) === Number(id));
  if (!r) return `<div class="card"><div class="card-hd"><div class="card-hd-title">Order details</div></div><div class="empty-state"><i class="ti ti-clipboard-list"></i><p>Select an order to see details</p></div></div>`;
  const rows = [
    ['Requester',   esc(r.requester_name || '—')],
    ['Type',        esc((r.request_type || '').replace(/_/g, ' '))],
    ['Quantity',    `${fmt(r.quantity || 0)} units`],
    ['Priority',    `<span class="pill ${_priorityClass(r.priority)}">${esc(r.priority || 'normal')}</span>`],
    ['From dept.',  esc(r.department_name || '—')],
    ['Target dept.',esc(r.target_department_name || '—')],
    ['Notes',       esc(r.notes || r.description || '—')],
  ];
  return `<div class="card">
    <div class="card-hd">
      <div class="card-hd-title">Order #${esc(String(r.id).padStart(4, '0'))} &mdash; details</div>
      ${pill(r.status || 'pending')}
    </div>
    <div style="padding:14px 16px">
      ${rows.map(([k, v], i) => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;${i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}font-size:12px">
          <span style="color:var(--txt2)">${k}</span>
          <span style="font-weight:600;text-align:right;max-width:60%">${v}</span>
        </div>`).join('')}
    </div>
    ${canManage() ? `<div style="display:flex;gap:8px;padding:14px 16px;border-top:1px solid var(--border)">
      ${(r.status||'').toLowerCase() === 'pending' ? `
        <button class="primary-btn" style="flex:1;background:var(--green);box-shadow:0 2px 8px rgba(34,197,94,.3)" onclick="approveReq(${r.id})"><i class="ti ti-check"></i> Approve</button>
        <button class="danger-btn" style="flex:1;justify-content:center" onclick="rejectReq(${r.id})"><i class="ti ti-x"></i> Reject</button>` : ''}
      ${(r.status||'').toLowerCase() === 'approved' ? `<button class="primary-btn" style="flex:1" onclick="completeReq(${r.id})"><i class="ti ti-check-all"></i> Mark complete</button>` : ''}
      ${!(['pending','approved'].includes((r.status||'').toLowerCase())) ? `<button class="sec-btn" style="flex:1;justify-content:center" onclick="window.print()"><i class="ti ti-printer"></i> Print</button>` : ''}
      <button class="danger-btn" style="flex:1;justify-content:center" onclick="deleteReq(${r.id})"><i class="ti ti-trash"></i> Cancel</button>
    </div>` : ''}
  </div>`;
}

function _orderTimelineCard(id) {
  const r = _reqAll.find(x => Number(x.id) === Number(id));
  if (!r) return `<div class="card"><div class="card-hd"><div class="card-hd-title">Delivery timeline</div></div><div class="empty-state"><i class="ti ti-route"></i><p>Pick an order to see the timeline</p></div></div>`;

  const s = (r.status || '').toLowerCase();
  const stages = [
    { key: 'pending',     title: 'Order submitted',     sub: 'Awaiting department head approval', icon: 'ti-clipboard-text' },
    { key: 'approved',    title: 'Approved',            sub: 'Materials reserved &amp; queued',   icon: 'ti-check' },
    { key: 'in_progress', title: 'In progress',         sub: 'Production / fulfilment ongoing',   icon: 'ti-loader' },
    { key: 'completed',   title: 'Completed',           sub: 'Marked as fulfilled',                icon: 'ti-flag-check' },
  ];
  // Determine each stage's state: done, active, pend, fail
  let activeIdx;
  if (s === 'pending')     activeIdx = 0;
  else if (s === 'approved')                          activeIdx = 1;
  else if (s === 'in_progress' || s === 'in-progress') activeIdx = 2;
  else if (s === 'completed' || s === 'dispatched' || s === 'delivered') activeIdx = 4;
  else activeIdx = -1; // rejected / cancelled

  const items = stages.map((stage, i) => {
    let cls, icon;
    if (s === 'rejected' || s === 'cancelled') {
      cls = i === 0 ? 'done' : 'pend';
      icon = i === 0 ? 'ti-x' : stage.icon;
    } else if (i < activeIdx)       { cls = 'done';   icon = 'ti-check'; }
    else if (i === activeIdx)        { cls = 'active'; icon = stage.icon; }
    else                              { cls = 'pend';   icon = 'ti-circle-dashed'; }
    return { ...stage, cls, icon, last: i === stages.length - 1 };
  });

  return `<div class="card">
    <div class="card-hd"><div class="card-hd-title">Order timeline &mdash; #${esc(String(r.id).padStart(4,'0'))}</div><div class="card-hd-act">${esc(r.status || '')}</div></div>
    <div style="padding:16px">
      ${items.map(it => `
        <div class="tl-item" style="display:flex;gap:12px;padding-bottom:16px">
          <div class="tl-left" style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:28px">
            <div class="tl-dot ${it.cls}" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;${
              it.cls === 'done'   ? 'background:rgba(34,197,94,.15);color:var(--green)' :
              it.cls === 'active' ? 'background:rgba(59,130,246,.15);color:var(--blue2);box-shadow:0 0 0 4px rgba(59,130,246,.1)' :
                                    'background:rgba(255,255,255,.04);color:var(--txt3)'
            }"><i class="ti ${it.icon}"></i></div>
            ${!it.last ? `<div class="tl-line ${it.cls === 'done' ? 'done' : ''}" style="width:2px;flex:1;margin-top:4px;background:${it.cls === 'done' ? 'rgba(34,197,94,.3)' : 'var(--border)'}"></div>` : ''}
          </div>
          <div class="tl-body" style="flex:1;padding-top:4px">
            <div class="tl-title ${it.cls === 'pend' ? 'pend' : ''}" style="font-size:12.5px;font-weight:600;color:${it.cls === 'pend' ? 'var(--txt2)' : 'var(--txt)'}">${it.title}${it.cls === 'active' ? ' <span style="color:var(--blue2);font-size:10px;margin-left:4px">&#9679; LIVE</span>' : ''}</div>
            <div class="tl-sub" style="font-size:11px;color:var(--txt2);margin-top:2px">${it.sub}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function _priorityClass(p) {
  const v = (p || 'normal').toLowerCase();
  if (v === 'urgent' || v === 'high') return 'r';
  if (v === 'low')                     return 'gr';
  return 'b';
}

// Backwards-compat aliases for any callers using the old names
function renderReqTable(items) { _renderReqTable(items); }

// Request types available per department (dept_id → allowed types)
const REQ_TYPES_BY_DEPT = {
  1: [['material_requisition','Material Requisition'], ['stock_adjustment','Stock Adjustment']],
  2: [['production_run','Production Run'], ['material_requisition','Material Requisition'], ['stock_adjustment','Stock Adjustment']],
  3: [['transfer_to_fg','Transfer to Finished Goods'], ['production_run','Production Run']],
  4: [['shipping_request','Shipping Request'], ['transfer_to_fg','Transfer to Finished Goods']],
  5: [['material_requisition','Material Requisition'], ['stock_adjustment','Stock Adjustment'],
      ['production_run','Production Run'], ['transfer_to_fg','Transfer to Finished Goods'],
      ['shipping_request','Shipping Request']],
  _all: [['material_requisition','Material Requisition'], ['production_run','Production Run'],
         ['transfer_to_fg','Transfer to Finished Goods'], ['shipping_request','Shipping Request'],
         ['stock_adjustment','Stock Adjustment']],
};

async function openAddRequest() {
  if (!canManage()) { toast('Only department heads or admins can submit requests', 'error'); return; }

  const userDeptId = App.user?.departmentId ?? App.user?.department_id;
  const isShipping = userDeptId == 4;

  let depts = [], prods = [];
  try { const r = await API.departments.list(); depts = Array.isArray(r) ? r : (r.departments||[]); } catch {}

  // Shipping dept sees finished goods; everyone else sees inventory
  if (isShipping) {
    try { const r = await API.finishedGoods.list(); prods = Array.isArray(r) ? r : (r.items||r.data||[]); } catch {}
  } else {
    try { const r = await API.inventory.list(); prods = Array.isArray(r) ? r : (r.items||[]); } catch {}
  }

  const typeOptions = (REQ_TYPES_BY_DEPT[userDeptId] || REQ_TYPES_BY_DEPT._all)
    .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  openModal('New request', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Request type *</label>
          <select id="r-type" class="form-select">${typeOptions}</select>
        </div>
        <div class="form-group"><label class="form-label">Priority</label>
          <select id="r-priority" class="form-select">
            <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Target department</label>
          <select id="r-dept" class="form-select">
            <option value="">— None —</option>
            ${depts.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">${isShipping ? 'Finished Good' : 'Material/Product'}</label>
          <select id="r-prod" class="form-select">
            <option value="">— None —</option>
            ${prods.map(p => `<option value="${p.id||p.product_id||p.fg_id}">${esc(p.name||p.product_name||'—')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input id="r-qty" class="form-input" type="number" min="0" placeholder="0"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="r-notes" class="form-textarea" rows="2" placeholder="Additional details..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddReq()"><i class="ti ti-send"></i> Submit request</button>
      </div>
    </div>
  `);
}

async function submitAddReq() {
  const requestType = $('#r-type')?.value;
  if (!requestType) { toast('Request type is required', 'error'); return; }
  try {
    await API.requests.create({
      requestType,
      targetDepartmentId: $('#r-dept')?.value || null,
      productId: $('#r-prod')?.value || null,
      quantity: Number($('#r-qty')?.value) || 0,
      priority: $('#r-priority')?.value || 'normal',
      notes: $('#r-notes')?.value.trim()
    });
    forceCloseModal(); toast('Request submitted'); renderRequests(); refreshBadges();
  } catch (err) { toast(err.message, 'error'); }
}

async function approveReq(id) {
  try { await API.requests.approve(id); toast('Request approved', 'success'); renderRequests(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}

function rejectReq(id) {
  openModal('Reject request', `
    <div class="form-section">
      <div class="form-group"><label class="form-label">Rejection reason</label><textarea id="rr-reason" class="form-textarea" rows="3" placeholder="Explain why this request is being rejected..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="danger-btn" onclick="submitRejectReq(${id})"><i class="ti ti-x"></i> Reject</button>
      </div>
    </div>
  `);
}

async function submitRejectReq(id) {
  const reason = $('#rr-reason')?.value.trim();
  try { await API.requests.reject(id, reason); forceCloseModal(); toast('Request rejected'); renderRequests(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}

async function completeReq(id) {
  try { await API.requests.complete(id); toast('Marked as completed'); renderRequests(); }
  catch (err) { toast(err.message, 'error'); }
}

function deleteReq(id) {
  confirm('Delete this request?', async () => {
    try { await API.requests.delete(id); toast('Deleted'); renderRequests(); refreshBadges(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
