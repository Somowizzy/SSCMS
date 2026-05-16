/* ══════════════════════════════════════════
   requests.js — Orders & Requests
   ══════════════════════════════════════════ */
let _reqAll = [];

async function renderRequests() {
  setHTML('#page-content', loading());
  try {
    const res = await API.requests.list();
    _reqAll   = Array.isArray(res) ? res : (res.items || res.data || []);
    window._pageSearch = q => renderReqTable(_reqAll.filter(r =>
      [r.description, r.name, r.title, r.type, String(r.id)].some(v => String(v||'').toLowerCase().includes(q.toLowerCase()))
    ));
    buildReqPage(_reqAll);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function buildReqPage(items) {
  const pending    = items.filter(r => (r.status||'').toLowerCase() === 'pending').length;
  const approved   = items.filter(r => (r.status||'').toLowerCase() === 'approved').length;
  const completed  = items.filter(r => (r.status||'').toLowerCase() === 'completed').length;
  const rejected   = items.filter(r => (r.status||'').toLowerCase() === 'rejected').length;

  setHTML('#page-content', `
    <div class="kpi-grid-5" style="grid-template-columns:repeat(5,1fr)">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-clipboard-list"></i></div></div><div class="kpi-val">${fmt(items.length)}</div><div class="kpi-lbl">Total</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clock"></i></div></div><div class="kpi-val text-amber">${fmt(pending)}</div><div class="kpi-lbl">Pending</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-circle-check"></i></div></div><div class="kpi-val text-blue">${fmt(approved)}</div><div class="kpi-lbl">Approved</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-check"></i></div></div><div class="kpi-val text-green">${fmt(completed)}</div><div class="kpi-lbl">Completed</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-x"></i></div></div><div class="kpi-val text-red">${fmt(rejected)}</div><div class="kpi-lbl">Rejected</div></div>
    </div>
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">All requests</div>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="req-filter" class="form-select" style="width:140px;padding:6px 10px;font-size:12px" onchange="filterReqs()">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
          <div class="card-hd-act" onclick="openAddRequest()"><i class="ti ti-plus"></i> New</div>
        </div>
      </div>
      <div id="req-table"></div>
    </div>
  `);
  renderReqTable(items);
}

function filterReqs() {
  const f = $('#req-filter')?.value;
  renderReqTable(f ? _reqAll.filter(r => (r.status||'').toLowerCase() === f) : _reqAll);
}

function renderReqTable(items) {
  if (!items.length) { setHTML('#req-table', empty('No requests found', 'ti-clipboard-list')); return; }
  const canApprove = canManage();
  setHTML('#req-table', `
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr>
        <th style="width:70px">ID</th><th>Type / Notes</th><th>Requested by</th>
        <th style="width:110px">Status</th><th style="width:80px">Date</th><th style="width:130px">Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(r => `
          <tr>
            <td class="mono">#${esc(r.id)}</td>
            <td>
              <div style="font-weight:600">${esc((r.request_type||r.type||'').replace(/_/g,' '))}</div>
              <div style="font-size:10.5px;color:var(--txt2)">${esc(r.notes||r.description||'')} ${r.quantity?'· '+fmt(r.quantity)+' '+(r.product_unit||''):''}</div>
            </td>
            <td style="color:var(--txt2)">${esc(r.requester_name||r.requested_by||'—')}</td>
            <td>${pill(r.status)}</td>
            ${tdDate(r.created_at||r.createdAt)}
            <td>
              <div style="display:flex;gap:4px">
                ${canApprove && (r.status||'').toLowerCase() === 'pending' ? `
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="approveReq(${r.id})" title="Approve"><i class="ti ti-check"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="rejectReq(${r.id})" title="Reject"><i class="ti ti-x"></i></button>` : ''}
                ${(r.status||'').toLowerCase() === 'approved' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--blue2)" onclick="completeReq(${r.id})" title="Mark complete"><i class="ti ti-check-all"></i></button>` : ''}
                ${canApprove ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteReq(${r.id})" title="Delete"><i class="ti ti-trash"></i></button>` : ''}
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>
  `);
}

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
