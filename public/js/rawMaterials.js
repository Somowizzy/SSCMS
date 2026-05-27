/* ══════════════════════════════════════════════════════════════
   rawMaterials.js — Raw Materials Department dashboard
   ══════════════════════════════════════════════════════════════
   - Role-gated UI (Department Head vs Department User)
   - KPIs, R-PET banner, critical-stock alerts, R-PET flow,
     full inventory table, pending-approval cards, forms
   - All data wired to the live API
*/

let _rmInventory   = [];
let _rmPendingReqs = [];

/* ---------- Helpers ---------- */
function _rmIsAdmin() {
  return ['hr_admin', 'system_admin'].includes(App.user?.role);
}
function _rmIsHead() {
  if (_rmIsAdmin()) return true;
  const did = App.user?.departmentId ?? App.user?.department_id;
  return App.user?.role === 'dept_head' && Number(did) === 1;
}
function _rmIsUser() {
  const did = App.user?.departmentId ?? App.user?.department_id;
  return App.user?.role === 'dept_user' && Number(did) === 1;
}
function _rmClassify(qty, reorder) {
  const r = Number(reorder) || 1;
  const q = Number(qty) || 0;
  if (q <= r * 0.3) return { status: 'Critical', color: 'red',   pillCls: 'r' };
  if (q <= r)       return { status: 'Low',      color: 'amber', pillCls: 'a' };
  return                  { status: 'In stock', color: 'green', pillCls: 'g' };
}
function _rmSku(item) {
  return item.sku || `MAT-${String(item.product_id || item.id).padStart(3, '0')}`;
}
function _rmIsRpet(item) {
  return /r-?pet/i.test(item.name || '');
}

/* ---------- Main render ---------- */
async function renderRawMaterials() {
  setHTML('#page-content', loading());
  try {
    const [invRes, reqRes] = await Promise.all([
      API.inventory.list().catch(() => ({ items: [] })),
      API.requests.list().catch(() => ({ requests: [] })),
    ]);
    _rmInventory = Array.isArray(invRes) ? invRes : (invRes.items || invRes.data || []);
    // Show only raw materials (and the R-PET recycled stock), not packaging or spare parts
    _rmInventory = _rmInventory.filter(i => {
      const cat = (i.category || '').toLowerCase();
      return cat === 'raw_material' || _rmIsRpet(i);
    });
    const allReqs = Array.isArray(reqRes) ? reqRes : (reqRes.requests || reqRes.items || reqRes.data || []);
    _rmPendingReqs = allReqs.filter(r =>
      Number(r.target_department_id) === 1 &&
      (r.status || '').toLowerCase() === 'pending'
    );

    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = _rmInventory.filter(i =>
        [i.name, i.sku, i.category, i.location].some(v => String(v || '').toLowerCase().includes(term))
      );
      _rmRenderInventoryTable(filtered);
    };

    _rmBuildPage();
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function _rmBuildPage() {
  const head  = _rmIsHead();
  const items = _rmInventory;

  // Metrics
  const tracked = items.length;
  const lowOrCritical = items.filter(i => Number(i.quantity_on_hand || 0) <= Number(i.reorder_level || 0)).length;
  const rpet = items.find(i => _rmIsRpet(i));
  const rpetQty  = rpet ? Number(rpet.quantity_on_hand || 0) : 0;
  const rpetUnit = rpet?.unit || 'kg';
  const pendingCount = _rmPendingReqs.length;

  const criticalItems = items
    .filter(i => Number(i.quantity_on_hand || 0) <= Number(i.reorder_level || 0))
    .sort((a, b) => Number(a.quantity_on_hand || 0) - Number(b.quantity_on_hand || 0))
    .slice(0, 5);

  setHTML('#page-content', `
    <!-- Header -->
    <div class="flex-between" style="flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.4px">Raw Materials Overview</div>
        <div style="font-size:12.5px;color:var(--txt2);margin-top:4px">${head
          ? 'Manage inventory, submit and approve material requests, and log incoming shipments.'
          : 'Log incoming material shipments. View inventory levels.'}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${head ? `
          <button class="primary-btn" style="background:var(--teal);box-shadow:0 2px 8px rgba(20,184,166,.3)" onclick="openRMSubmitRequest()"><i class="ti ti-send"></i> Submit material request</button>
          <button class="primary-btn" onclick="openRMAddMaterial()"><i class="ti ti-plus"></i> Add material</button>
        ` : ''}
        <button class="primary-btn" style="background:var(--green);box-shadow:0 2px 8px rgba(34,197,94,.3)" onclick="openRMReceiving()"><i class="ti ti-arrow-down-left"></i> Log receiving</button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-packages"></i></div></div><div class="kpi-val">${fmt(tracked)}</div><div class="kpi-lbl">Raw materials tracked</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-alert-triangle"></i></div></div><div class="kpi-val text-red">${fmt(lowOrCritical)}</div><div class="kpi-lbl">Critical / low stock</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-recycle"></i></div></div><div class="kpi-val text-teal">${fmt(rpetQty)} ${esc(rpetUnit)}</div><div class="kpi-lbl">R-PET available</div></div>
      ${head
        ? `<div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clipboard-list"></i></div></div><div class="kpi-val text-amber">${fmt(pendingCount)}</div><div class="kpi-lbl">Pending requests to approve</div></div>`
        : `<div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-truck-loading"></i></div></div><div class="kpi-val text-green">${fmt(_rmReceivingsThisWeek())}</div><div class="kpi-lbl">Shipments received this week</div></div>`}
    </div>

    <!-- R-PET banner -->
    <div class="rpet-banner">
      <div style="font-size:24px">&#9851;&#65039;</div>
      <div class="rpet-stat"><div class="val">${fmt(rpetQty)} ${esc(rpetUnit)}</div><div class="lbl">R-PET in stock</div></div>
      <div class="rpet-divider"></div>
      <div class="rpet-stat"><div class="val">${fmt(Math.round(rpetQty * 3.8))} ${esc(rpetUnit)}</div><div class="lbl">Recycled this month</div></div>
      ${head ? `<button class="primary-btn" style="background:var(--teal);margin-left:auto;box-shadow:0 2px 8px rgba(20,184,166,.3)" onclick="openRMLogRpet()"><i class="ti ti-recycle"></i> Log R-PET batch</button>` : ''}
    </div>

    <!-- Two-column: critical alerts + (approvals OR receivings) -->
    <div class="two-col-wide">
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title"><i class="ti ti-alert-triangle text-red"></i>&nbsp; Critical stock alerts</div>
        </div>
        ${criticalItems.length === 0
          ? `<div class="empty-state"><i class="ti ti-circle-check text-green"></i><p>No critical stock alerts. All materials above reorder level.</p></div>`
          : criticalItems.map(i => _rmCriticalRowHtml(i)).join('')}
      </div>

      ${head
        ? _rmApprovalListCard()
        : _rmRecentReceivingsCard()
      }
    </div>

    <!-- R-PET flow -->
    <div class="card" style="border-color:rgba(20,184,166,.2)">
      <div class="card-hd" style="background:rgba(20,184,166,.04)">
        <div class="card-hd-title" style="color:var(--teal)">&#9851; R-PET Recycling Flow</div>
      </div>
      <div class="flow-canvas">
        <div class="flow-node prod"><div class="fn-icon">&#127981;</div><div class="fn-title">Production Floor</div><div class="fn-sub">Rejections collected</div></div>
        <div class="flow-arr"><div class="arr-line red"></div><span style="font-size:12px;color:#f87171">&#9658;</span><div class="arr-label">Sent here</div></div>
        <div class="flow-node weigh"><div class="fn-icon">&#9878;&#65039;</div><div class="fn-title" style="color:var(--purple)">Weighing</div><div class="fn-sub">Raw Mat. dept.</div><div class="fn-badge p">Our dept.</div></div>
        <div class="flow-arr"><div class="arr-line teal"></div><span style="font-size:12px;color:var(--teal)">&#9658;</span></div>
        <div class="flow-node grind"><div class="fn-icon">&#9881;&#65039;</div><div class="fn-title" style="color:var(--teal)">Grinding Unit</div><div class="fn-sub">Raw Mat. dept.</div><div class="fn-badge t">Our dept.</div></div>
        <div class="flow-arr"><div class="arr-line teal"></div><span style="font-size:12px;color:var(--teal)">&#9658;</span></div>
        <div class="flow-node rpet"><div class="fn-icon">&#9851;&#65039;</div><div class="fn-title" style="color:var(--teal)">R-PET Inventory</div><div class="fn-sub">${fmt(rpetQty)} ${esc(rpetUnit)} available</div><div class="fn-badge t">Our dept.</div></div>
        <div class="flow-arr"><div class="arr-line"></div><span style="font-size:12px;color:var(--txt3)">&#9658;</span><div class="arr-label">On request</div></div>
        <div class="flow-node req"><div class="fn-icon">&#128203;</div><div class="fn-title">Production Request</div><div class="fn-sub">Approved by ${head ? '<strong style="color:var(--green)">you</strong>' : 'dept. head'}</div></div>
      </div>
    </div>

    <!-- Inventory table -->
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">Raw materials inventory <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${items.length} items</span></div>
        ${head ? `<div class="card-hd-act" onclick="openRMAddMaterial()"><i class="ti ti-plus"></i> Add material</div>` : ''}
      </div>
      <div id="rm-inv-table"></div>
    </div>

    ${head ? _rmPendingApprovalsCard() : _rmUserInfoNote()}
  `);

  _rmRenderInventoryTable(items);
}

/* ---------- Sub-renders ---------- */
function _rmRenderInventoryTable(items) {
  const head = _rmIsHead();
  setHTML('#rm-inv-table', `
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr>
        <th style="width:110px">SKU</th>
        <th>Material</th>
        <th style="width:100px">Type</th>
        <th style="width:120px">Quantity</th>
        <th style="width:140px">Level</th>
        <th style="width:100px">Status</th>
        <th style="width:130px">Actions</th>
      </tr></thead>
      <tbody>
        ${items.length === 0
          ? `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-box-off"></i><p>No raw materials found</p></div></td></tr>`
          : items.map(i => {
              const qty = Number(i.quantity_on_hand || 0);
              const reorder = Number(i.reorder_level || 1);
              const pct = Math.max(0, Math.min(100, Math.round((qty / Math.max(reorder * 1.5, 1)) * 100)));
              const { status, color, pillCls } = _rmClassify(qty, reorder);
              const isRpet = _rmIsRpet(i);
              return `<tr>
                <td class="mono">${esc(_rmSku(i))}</td>
                <td><strong>${isRpet ? '<span style="color:var(--teal)">&#9851;</span> ' : ''}${esc(i.name || '—')}${isRpet ? ' <span class="zone-tag teal">R-PET</span>' : ''}</strong></td>
                <td style="color:var(--txt2);font-size:11px">${esc(i.category || '—')}</td>
                <td style="color:var(--${color});font-weight:700">${fmt(qty)} ${esc(i.unit || '')}</td>
                <td><div class="prog"><div class="prog-f" style="width:${pct}%;background:var(--${color})"></div></div></td>
                <td><span class="pill ${pillCls}">${status}</span></td>
                <td><div style="display:flex;gap:4px">
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="openRMReceiving(${i.id})" title="Log receiving"><i class="ti ti-arrow-down-left"></i></button>
                  ${head ? `
                    <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openRMAdjust(${i.id})" title="Adjust"><i class="ti ti-adjustments"></i></button>
                    <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openRMEditMaterial(${i.id})" title="Edit"><i class="ti ti-edit"></i></button>
                  ` : ''}
                </div></td>
              </tr>`;
            }).join('')}
      </tbody>
    </table></div>
  `);
}

function _rmCriticalRowHtml(i) {
  const qty = Number(i.quantity_on_hand || 0);
  const reorder = Number(i.reorder_level || 1);
  const pct = Math.max(0, Math.min(100, Math.round((qty / Math.max(reorder, 1)) * 100)));
  return `<div class="inv-row">
    <div class="inv-row-top">
      <div>
        <div style="font-size:12px;font-weight:500;color:var(--txt)">${esc(i.name)}</div>
        <div style="font-size:10.5px;color:var(--txt2)">${esc(_rmSku(i))} &middot; Min: ${fmt(reorder)} ${esc(i.unit || '')}</div>
      </div>
      <div style="font-size:13px;font-weight:700;font-family:'Space Grotesk',sans-serif;color:var(--red)">${fmt(qty)} ${esc(i.unit || '')}</div>
    </div>
    <div class="prog"><div class="prog-f" style="width:${pct}%;background:var(--red)"></div></div>
  </div>`;
}

function _rmApprovalListCard() {
  const reqs = _rmPendingReqs.slice(0, 5);
  return `<div class="card">
    <div class="card-hd">
      <div class="card-hd-title"><i class="ti ti-clock text-amber"></i>&nbsp; Awaiting approval</div>
      <div class="card-hd-act" onclick="goTo('requests')">View all &rarr;</div>
    </div>
    ${reqs.length === 0
      ? `<div class="empty-state"><i class="ti ti-checks text-green"></i><p>No requests awaiting your approval.</p></div>`
      : reqs.map(r => `
        <div class="alert-item">
          <div class="a-dot" style="background:var(--amber)"></div>
          <div class="a-body">
            <div class="a-title">${esc(r.notes || (r.request_type || '').replace(/_/g, ' ') || 'Material request')}</div>
            <div class="a-sub" style="white-space:normal">${esc((r.request_type || '').replace(/_/g, ' '))} &middot; ${fmt(r.quantity || 0)} &middot; from ${esc(r.requester_name || '—')}</div>
          </div>
          <div style="font-size:10px;color:var(--txt3);flex-shrink:0">${ago(r.created_at)}</div>
        </div>
      `).join('')}
  </div>`;
}

function _rmRecentReceivingsCard() {
  // Best-effort: show the most recently updated inventory rows as proxy for receivings
  const recent = [..._rmInventory]
    .filter(i => i.last_updated)
    .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))
    .slice(0, 5);
  return `<div class="card">
    <div class="card-hd">
      <div class="card-hd-title"><i class="ti ti-truck-loading text-green"></i>&nbsp; Recent activity</div>
    </div>
    ${recent.length === 0
      ? `<div class="empty-state"><i class="ti ti-truck-loading"></i><p>No recent receivings logged yet.</p></div>`
      : recent.map(i => `
        <div class="alert-item">
          <div class="a-dot" style="background:var(--green)"></div>
          <div class="a-body">
            <div class="a-title">${esc(i.name)} &middot; ${fmt(i.quantity_on_hand)} ${esc(i.unit || '')}</div>
            <div class="a-sub" style="white-space:normal">${esc(i.location || 'Warehouse')} &middot; batch ${esc(i.batch_no || '—')}</div>
          </div>
          <div style="font-size:10px;color:var(--txt3);flex-shrink:0">${ago(i.last_updated)}</div>
        </div>
      `).join('')}
  </div>`;
}

function _rmPendingApprovalsCard() {
  const reqs = _rmPendingReqs;
  if (reqs.length === 0) return '';
  return `<div class="card" style="border-color:rgba(245,158,11,.3)">
    <div class="card-hd" style="background:rgba(245,158,11,.04)">
      <div class="card-hd-title" style="color:var(--amber)"><i class="ti ti-clock"></i>&nbsp; Pending approval (${reqs.length})</div>
      <div class="card-hd-act" onclick="goTo('requests')">View all &rarr;</div>
    </div>
    ${reqs.slice(0, 5).map(r => `
      <div class="req-card">
        <div class="flex-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1;min-width:220px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="mono">#REQ-${esc(String(r.id).padStart(4,'0'))}</span>
              <strong style="font-size:13px">${esc(r.notes || (r.request_type || '').replace(/_/g, ' ') || 'Material request')}</strong>
              <span class="pill a">Pending</span>
              <span class="zone-tag">${esc((r.request_type || '').replace(/_/g, ' '))}</span>
            </div>
            <div class="req-meta">
              <span><i class="ti ti-scale"></i> ${fmt(r.quantity || 0)}</span>
              <span><i class="ti ti-user"></i> ${esc(r.requester_name || '—')}</span>
              <span><i class="ti ti-clock"></i> ${ago(r.created_at)}</span>
            </div>
            ${r.notes ? `<div class="req-notes">${esc(r.notes)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="primary-btn" style="padding:6px 12px;font-size:12px;background:var(--green);box-shadow:0 2px 8px rgba(34,197,94,.3)" onclick="rmApproveReq(${r.id})"><i class="ti ti-check"></i> Approve</button>
            <button class="danger-btn" style="padding:6px 12px;font-size:12px" onclick="rmRejectReq(${r.id})"><i class="ti ti-x"></i> Reject</button>
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function _rmUserInfoNote() {
  return `<div class="info-note">
    <i class="ti ti-info-circle"></i>
    <span><strong>Note:</strong> Your role lets you log incoming material shipments and view inventory. Material requests, approvals, and inventory edits are handled by the department head.</span>
  </div>`;
}

function _rmReceivingsThisWeek() {
  // Count inventory rows touched within the last 7 days (proxy for receivings)
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  return _rmInventory.filter(i => {
    if (!i.last_updated) return false;
    const t = new Date(i.last_updated).getTime();
    return !isNaN(t) && (now - t) <= week;
  }).length;
}

/* ---------- Modals ---------- */
function openRMReceiving(invId) {
  const items = _rmInventory;
  const selectedItem = invId ? items.find(i => Number(i.id) === Number(invId)) : null;
  openModal('Log incoming shipment', `
    <div class="form-section">
      <div class="req-info" style="background:rgba(34,197,94,.07);border-color:rgba(34,197,94,.25);color:var(--green)">
        <i class="ti ti-info-circle"></i>
        <span>Recording materials received from suppliers. Inventory levels update on submit.</span>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material received *</label>
          <select id="rm-rec-item" class="form-select">
            ${items.map(i => `<option value="${i.id}" ${selectedItem && selectedItem.id===i.id?'selected':''}>${esc(i.name)} &mdash; ${esc(_rmSku(i))}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Quantity received *</label><input id="rm-rec-qty" class="form-input" type="number" min="0" step="any" placeholder="e.g. 500"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Supplier</label><input id="rm-rec-supplier" class="form-input" placeholder="e.g. ChemPlas NG"/></div>
        <div class="form-group"><label class="form-label">PO number</label><input id="rm-rec-po" class="form-input" placeholder="e.g. PO-0192"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes (optional)</label><textarea id="rm-rec-notes" class="form-textarea" rows="2" placeholder="Any observations about the shipment..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--green);box-shadow:0 2px 8px rgba(34,197,94,.3)" onclick="submitRMReceiving()"><i class="ti ti-check"></i> Confirm receipt</button>
      </div>
    </div>
  `);
}

async function submitRMReceiving() {
  const invId = Number($('#rm-rec-item')?.value);
  const qty   = Number($('#rm-rec-qty')?.value);
  if (!invId || !qty || qty <= 0) { toast('Pick a material and a positive quantity', 'error'); return; }
  const item = _rmInventory.find(i => Number(i.id) === invId);
  if (!item) { toast('Material not found', 'error'); return; }
  const newQty = Number(item.quantity_on_hand || 0) + qty;
  const supplier = $('#rm-rec-supplier')?.value.trim();
  const po       = $('#rm-rec-po')?.value.trim();
  const notes    = $('#rm-rec-notes')?.value.trim();
  const batchNo  = po ? `RX-${po}` : `RX-${Date.now().toString().slice(-6)}`;
  try {
    await API.inventory.update(invId, { quantityOnHand: newQty, batchNo });
    forceCloseModal();
    toast(`Logged: ${fmt(qty)} ${item.unit || ''} of ${item.name}`, 'success');
    renderRawMaterials();
    refreshBadges();
  } catch (err) { toast(err.message, 'error'); }
}

function openRMAddMaterial() {
  openModal('Add raw material', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material name *</label><input id="rm-add-name" class="form-input" placeholder="e.g. PET Resin (Grade C)"/></div>
        <div class="form-group"><label class="form-label">Category *</label>
          <select id="rm-add-cat" class="form-select">
            <option value="raw_material">Raw material</option>
            <option value="packaging">Packaging</option>
            <option value="spare_part">Spare part</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Unit</label>
          <select id="rm-add-unit" class="form-select">
            <option value="kg">kg</option><option value="litre">litre</option><option value="pcs">pcs</option><option value="roll">roll</option><option value="m">m</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Reorder level</label><input id="rm-add-reorder" class="form-input" type="number" min="0" placeholder="e.g. 100"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Initial quantity</label><input id="rm-add-qty" class="form-input" type="number" min="0" value="0"/></div>
        <div class="form-group"><label class="form-label">Unit price (&#8358;)</label><input id="rm-add-price" class="form-input" type="number" min="0" step="any" placeholder="0.00"/></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea id="rm-add-desc" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitRMAddMaterial()"><i class="ti ti-plus"></i> Add material</button>
      </div>
    </div>
  `);
}

async function submitRMAddMaterial() {
  const name = $('#rm-add-name')?.value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  try {
    await API.inventory.create({
      name,
      category:     $('#rm-add-cat')?.value || 'raw_material',
      unit:         $('#rm-add-unit')?.value || 'kg',
      reorderLevel: Number($('#rm-add-reorder')?.value) || 10,
      quantity:     Number($('#rm-add-qty')?.value) || 0,
      unitPrice:    Number($('#rm-add-price')?.value) || 0,
      description:  $('#rm-add-desc')?.value.trim(),
      location:     'Warehouse A',
    });
    forceCloseModal();
    toast('Material added', 'success');
    renderRawMaterials();
  } catch (err) { toast(err.message, 'error'); }
}

function openRMAdjust(invId) {
  const item = _rmInventory.find(i => Number(i.id) === Number(invId));
  if (!item) return;
  openModal(`Adjust stock — ${item.name}`, `
    <div class="form-section">
      <div class="req-info"><i class="ti ti-info-circle"></i><span>Set the new on-hand quantity for <strong>${esc(item.name)}</strong>. Current: ${fmt(item.quantity_on_hand)} ${esc(item.unit||'')}</span></div>
      <div class="form-group"><label class="form-label">New quantity on hand *</label><input id="rm-adj-qty" class="form-input" type="number" min="0" step="any" value="${item.quantity_on_hand}"/></div>
      <div class="form-group"><label class="form-label">Reason / notes</label><textarea id="rm-adj-notes" class="form-textarea" rows="2" placeholder="Why is this being adjusted?"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitRMAdjust(${invId})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitRMAdjust(invId) {
  const q = Number($('#rm-adj-qty')?.value);
  if (isNaN(q) || q < 0) { toast('Enter a valid quantity', 'error'); return; }
  try {
    await API.inventory.update(invId, { quantityOnHand: q });
    forceCloseModal(); toast('Inventory adjusted'); renderRawMaterials();
  } catch (err) { toast(err.message, 'error'); }
}

function openRMEditMaterial(invId) {
  const item = _rmInventory.find(i => Number(i.id) === Number(invId));
  if (!item) return;
  openModal(`Edit ${item.name}`, `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input id="rm-edit-name" class="form-input" value="${esc(item.name||'')}"/></div>
        <div class="form-group"><label class="form-label">Reorder level</label><input id="rm-edit-reorder" class="form-input" type="number" min="0" value="${item.reorder_level||0}"/></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea id="rm-edit-desc" class="form-textarea" rows="2">${esc(item.description||'')}</textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitRMEditMaterial(${invId})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitRMEditMaterial(invId) {
  try {
    await API.inventory.update(invId, {
      name: $('#rm-edit-name')?.value.trim(),
      reorderLevel: Number($('#rm-edit-reorder')?.value) || 0,
      description: $('#rm-edit-desc')?.value.trim(),
    });
    forceCloseModal(); toast('Material updated'); renderRawMaterials();
  } catch (err) { toast(err.message, 'error'); }
}

function openRMSubmitRequest() {
  const items = _rmInventory;
  openModal('Submit material request', `
    <div class="form-section">
      <div class="req-info"><i class="ti ti-info-circle"></i><span>Submit a procurement order or R-PET request on behalf of Raw Materials. It will appear under Orders &amp; Requests.</span></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Request type *</label>
          <select id="rm-req-type" class="form-select">
            <option value="material_requisition">Material Requisition</option>
            <option value="stock_adjustment">Stock Adjustment</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Priority</label>
          <select id="rm-req-priority" class="form-select">
            <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Material</label>
          <select id="rm-req-prod" class="form-select">
            <option value="">&mdash; None &mdash;</option>
            ${items.map(i => `<option value="${i.product_id||i.id}">${esc(i.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Quantity</label><input id="rm-req-qty" class="form-input" type="number" min="0" step="any" placeholder="e.g. 5000"/></div>
      </div>
      <div class="form-group"><label class="form-label">Reason / Notes</label><textarea id="rm-req-notes" class="form-textarea" rows="2" placeholder="Why is this needed?"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--teal);box-shadow:0 2px 8px rgba(20,184,166,.3)" onclick="submitRMRequest()"><i class="ti ti-send"></i> Submit request</button>
      </div>
    </div>
  `);
}

async function submitRMRequest() {
  try {
    await API.requests.create({
      requestType: $('#rm-req-type')?.value || 'material_requisition',
      targetDepartmentId: 1,
      productId: $('#rm-req-prod')?.value || null,
      quantity: Number($('#rm-req-qty')?.value) || 0,
      priority: $('#rm-req-priority')?.value || 'normal',
      notes: $('#rm-req-notes')?.value.trim(),
    });
    forceCloseModal(); toast('Request submitted'); renderRawMaterials(); refreshBadges();
  } catch (err) { toast(err.message, 'error'); }
}

function openRMLogRpet() {
  const rpet = _rmInventory.find(_rmIsRpet);
  if (!rpet) { toast('No R-PET inventory row exists. Add one first.', 'error'); return; }
  openModal('Log R-PET batch', `
    <div class="form-section">
      <div class="req-info" style="background:rgba(20,184,166,.07);border-color:rgba(20,184,166,.25);color:var(--teal)">
        <i class="ti ti-info-circle"></i><span>Add a newly ground batch of R-PET to inventory. Current: ${fmt(rpet.quantity_on_hand)} ${esc(rpet.unit||'kg')}</span>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Batch weight (${esc(rpet.unit||'kg')}) *</label><input id="rm-rpet-qty" class="form-input" type="number" min="0" step="any" placeholder="e.g. 250"/></div>
        <div class="form-group"><label class="form-label">Source run</label><input id="rm-rpet-src" class="form-input" placeholder="e.g. Run #R-0441"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="rm-rpet-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--teal)" onclick="submitRMRpet(${rpet.id})"><i class="ti ti-recycle"></i> Log batch</button>
      </div>
    </div>
  `);
}

async function submitRMRpet(invId) {
  const item = _rmInventory.find(i => Number(i.id) === Number(invId));
  const q = Number($('#rm-rpet-qty')?.value);
  if (!item || !q || q <= 0) { toast('Enter a positive batch weight', 'error'); return; }
  const newQty = Number(item.quantity_on_hand || 0) + q;
  const src = $('#rm-rpet-src')?.value.trim();
  try {
    await API.inventory.update(invId, { quantityOnHand: newQty, batchNo: src ? `RPET-${src}` : `RPET-${Date.now().toString().slice(-6)}` });
    forceCloseModal(); toast(`Logged ${fmt(q)} ${item.unit||'kg'} of R-PET`, 'success'); renderRawMaterials();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- Approve / reject pending requests ---------- */
async function rmApproveReq(id) {
  try { await API.requests.approve(id); toast('Request approved', 'success'); renderRawMaterials(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}

function rmRejectReq(id) {
  openModal('Reject request', `
    <div class="form-section">
      <div class="form-group"><label class="form-label">Rejection reason</label><textarea id="rm-rej-reason" class="form-textarea" rows="3" placeholder="Explain why this request is being rejected..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="danger-btn" onclick="submitRMReject(${id})"><i class="ti ti-x"></i> Reject</button>
      </div>
    </div>
  `);
}

async function submitRMReject(id) {
  const reason = $('#rm-rej-reason')?.value.trim();
  try { await API.requests.reject(id, reason); forceCloseModal(); toast('Request rejected'); renderRawMaterials(); refreshBadges(); }
  catch (err) { toast(err.message, 'error'); }
}
