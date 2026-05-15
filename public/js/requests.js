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
  const isAdmin = ['admin','Admin'].includes(App.user?.role);
  setHTML('#req-table', `
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr>
        <th style="width:70px">ID</th><th>Description / Type</th><th>Requested by</th>
        <th style="width:110px">Status</th><th style="width:80px">Date</th><th style="width:120px">Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(r => `
          <tr>
            <td class="mono">#${esc(r.id)}</td>
            <td>
              <div style="font-weight:600">${esc(r.description||r.name||r.title||'—')}</div>
              <div style="font-size:10.5px;color:var(--txt2)">${esc(r.type||'')} ${r.quantity?'· '+fmt(r.quantity)+' '+(r.unit||''):''}</div>
            </td>
            <td style="color:var(--txt2)">${esc(r.requested_by||r.requestedBy||r.user||'—')}</td>
            <td>${pill(r.status)}</td>
            ${tdDate(r.created_at||r.createdAt)}
            <td>
              <div style="display:flex;gap:4px">
                ${isAdmin && (r.status||'').toLowerCase() === 'pending' ? `
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="approveReq(${r.id})" title="Approve"><i class="ti ti-check"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="rejectReq(${r.id})" title="Reject"><i class="ti ti-x"></i></button>` : ''}
                ${(r.status||'').toLowerCase() === 'approved' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--blue2)" onclick="completeReq(${r.id})" title="Mark complete"><i class="ti ti-check-all"></i></button>` : ''}
                <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteReq(${r.id})" title="Delete"><i class="ti ti-trash"></i></button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>
  `);
}

function openAddRequest() {
  openModal('New request', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Request type</label>
          <select id="r-type" class="form-select">
            <option value="material">Raw material</option><option value="rpet">R-PET</option>
            <option value="production">Production order</option><option value="maintenance">Maintenance</option><option value="other">Other</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Quantity</label><input id="r-qty" class="form-input" type="number" min="0" placeholder="0"/></div>
      </div>
      <div class="form-group"><label class="form-label">Description *</label><input id="r-desc" class="form-input" placeholder="What are you requesting?"/></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="r-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddReq()"><i class="ti ti-send"></i> Submit</button>
      </div>
    </div>
  `);
}

async function submitAddReq() {
  const desc = $('#r-desc')?.value.trim();
  if (!desc) { toast('Description required', 'error'); return; }
  try {
    await API.requests.create({ type: $('#r-type')?.value, description: desc, quantity: Number($('#r-qty')?.value)||null, notes: $('#r-notes')?.value.trim() });
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
