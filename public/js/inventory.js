let _invAll = [];

async function renderInventory() {
  setHTML('#page-content', loading());
  try {
    const res  = await API.inventory.list();
    _invAll    = Array.isArray(res) ? res : (res.items || res.data || []);
    window._pageSearch = q => renderInvTable(_invAll.filter(i =>
      [i.name, i.material_name, i.item_name, i.sku, i.code, i.category, i.type, i.material_type]
        .some(v => String(v||'').toLowerCase().includes(q.toLowerCase()))
    ));
    buildInvPage(_invAll);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p><button class="sec-btn" onclick="renderInventory()"><i class="ti ti-refresh"></i> Retry</button></div>`);
  }
}

function buildInvPage(items) {
  const total    = items.length;
  const critical = items.filter(i => isCritical(i)).length;
  const low      = items.filter(i => isLow(i) && !isCritical(i)).length;
  const rpet     = items.filter(i => isRpet(i)).length;

  setHTML('#page-content', `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-packages"></i></div></div><div class="kpi-val">${fmt(total)}</div><div class="kpi-lbl">Total items</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-alert-triangle"></i></div></div><div class="kpi-val text-red">${fmt(critical)}</div><div class="kpi-lbl">Critical stock</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-alert-circle"></i></div></div><div class="kpi-val text-amber">${fmt(low)}</div><div class="kpi-lbl">Low stock</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-recycle"></i></div></div><div class="kpi-val text-teal">${fmt(rpet)}</div><div class="kpi-lbl">R-PET items</div></div>
    </div>

    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">Inventory register <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${total} items</span></div>
        <div style="display:flex;gap:8px">
          <select id="inv-filter" class="form-select" style="width:150px;padding:6px 10px;font-size:12px" onchange="filterInv()">
            <option value="">All items</option>
            <option value="critical">Critical only</option>
            <option value="low">Low stock</option>
            <option value="rpet">R-PET only</option>
          </select>
          <div class="card-hd-act" onclick="openAddInventory()"><i class="ti ti-plus"></i> Add</div>
        </div>
      </div>
      <div id="inv-table-wrap"><div class="loading-state"><div class="loading-spinner"></div></div></div>
    </div>
  `);
  renderInvTable(items);
}

function filterInv() {
  const f = $('#inv-filter')?.value;
  let list = _invAll;
  if (f === 'critical') list = _invAll.filter(isCritical);
  else if (f === 'low')      list = _invAll.filter(i => isLow(i) && !isCritical(i));
  else if (f === 'rpet')     list = _invAll.filter(isRpet);
  renderInvTable(list);
}

function renderInvTable(items) {
  if (!items.length) { setHTML('#inv-table-wrap', empty('No items found', 'ti-box')); return; }
  setHTML('#inv-table-wrap', `
    <div class="tbl-wrap">
      <table class="data-table">
        <thead><tr>
          <th style="width:80px">SKU</th>
          <th>Name / Material</th>
          <th style="width:80px">Type</th>
          <th style="width:100px">Quantity</th>
          <th style="width:90px">Min Qty</th>
          <th style="width:120px">Level</th>
          <th style="width:90px">Status</th>
          <th style="width:90px">Actions</th>
        </tr></thead>
        <tbody>
          ${items.map(i => {
            const qty    = i.quantity || i.qty || 0;
            const minQty = i.min_quantity || i.minQty || i.reorder_point || 0;
            const pct    = minQty ? Math.min(100,(qty/(minQty*2))*100) : 60;
            const color  = pct < 20 ? '#ef4444' : pct < 40 ? 'var(--amber)' : pct < 75 ? 'var(--blue2)' : 'var(--green)';
            const rpet   = isRpet(i);
            const status = isCritical(i) ? 'critical' : isLow(i) ? 'low' : 'in-stock';
            const name   = i.name || i.material_name || i.item_name || '—';
            const type   = i.material_type || i.type || i.category || '—';
            return `<tr>
              <td class="mono">${esc(i.sku || i.code || i.id)}</td>
              <td>
                ${rpet ? '<span style="color:var(--teal);margin-right:4px">&#9851;</span>' : ''}
                <strong>${esc(name)}</strong>
                ${rpet ? '<span style="font-size:9px;background:rgba(20,184,166,.15);color:var(--teal);padding:1px 5px;border-radius:4px;margin-left:4px">R-PET</span>' : ''}
              </td>
              <td style="color:var(--txt2);font-size:11px">${esc(type)}</td>
              <td style="color:${color};font-weight:700">${fmt(qty)} ${i.unit||''}</td>
              <td style="color:var(--txt2)">${minQty ? fmt(minQty)+' '+(i.unit||'') : '—'}</td>
              <td>${progBar(pct,color)}</td>
              <td>${pill(status)}</td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="icon-btn" style="width:26px;height:26px;font-size:13px" onclick="openAdjustInventory(${i.id},'${esc(name)}')" title="Adjust"><i class="ti ti-adjustments"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:13px" onclick="openEditInventory(${i.id})" title="Edit"><i class="ti ti-edit"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:13px;color:#f87171" onclick="deleteInventory(${i.id},'${esc(name)}')" title="Delete"><i class="ti ti-trash"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `);
}

/* ── Helpers ── */
const isRpet     = i => (i.type||i.material_type||i.name||'').toLowerCase().includes('rpet') || (i.type||i.material_type||'').toLowerCase().includes('r-pet');
const isCritical = i => { const q = i.quantity||i.qty||0; const m = i.min_quantity||i.minQty||i.reorder_point||0; return m > 0 && q <= m*0.2; };
const isLow      = i => { const q = i.quantity||i.qty||0; const m = i.min_quantity||i.minQty||i.reorder_point||0; return m > 0 && q <= m; };

/* ── Add ── */
function openAddInventory() {
  openModal('Add inventory item', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name / Material *</label><input id="f-name" class="form-input" placeholder="e.g. PET Resin"/></div>
        <div class="form-group"><label class="form-label">SKU / Code</label><input id="f-sku" class="form-input" placeholder="MAT-001"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Type / Category</label>
          <select id="f-type" class="form-select">
            <option value="raw">Raw Material</option>
            <option value="rpet">R-PET (Recycled)</option>
            <option value="additive">Additive</option>
            <option value="packaging">Packaging</option>
            <option value="maintenance">Maintenance</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Unit</label>
          <select id="f-unit" class="form-select"><option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="m">m</option><option value="units">units</option><option value="pcs">pcs</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity *</label><input id="f-qty" class="form-input" type="number" min="0" placeholder="0"/></div>
        <div class="form-group"><label class="form-label">Minimum quantity (reorder point)</label><input id="f-min" class="form-input" type="number" min="0" placeholder="0"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="f-notes" class="form-textarea" rows="2" placeholder="Optional notes..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddInventory()"><i class="ti ti-plus"></i> Add item</button>
      </div>
    </div>
  `);
}

async function submitAddInventory() {
  const name = $('#f-name')?.value.trim();
  const qty  = Number($('#f-qty')?.value);
  if (!name) { toast('Name is required', 'error'); return; }
  try {
    await API.inventory.create({
      name, sku: $('#f-sku')?.value.trim(),
      material_type: $('#f-type')?.value,
      unit: $('#f-unit')?.value,
      quantity: qty,
      min_quantity: Number($('#f-min')?.value)||0,
      notes: $('#f-notes')?.value.trim(),
    });
    forceCloseModal(); toast('Item added'); renderInventory();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Adjust ── */
function openAdjustInventory(id, name) {
  openModal(`Adjust stock — ${name}`, `
    <div class="form-section">
      <div class="req-info">&#9851; Adjustments are logged in the audit trail. Use positive numbers to add stock, negative to remove.</div>
      <div class="form-group"><label class="form-label">Adjustment quantity (e.g. +500 or -200)</label><input id="f-adj" class="form-input" type="number" placeholder="e.g. 500"/></div>
      <div class="form-group"><label class="form-label">Reason</label>
        <select id="f-adj-reason" class="form-select">
          <option value="received">Stock received from supplier</option>
          <option value="rpet">R-PET batch added from grinding</option>
          <option value="consumed">Consumed in production</option>
          <option value="damaged">Damaged / spoiled</option>
          <option value="correction">Stock count correction</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="f-adj-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAdjust(${id})"><i class="ti ti-check"></i> Apply adjustment</button>
      </div>
    </div>
  `);
}

async function submitAdjust(id) {
  const qty = Number($('#f-adj')?.value);
  if (!qty) { toast('Enter a quantity', 'error'); return; }
  try {
    await API.inventory.adjust(id, { adjustment: qty, reason: $('#f-adj-reason')?.value, notes: $('#f-adj-notes')?.value.trim() });
    forceCloseModal(); toast('Stock adjusted'); renderInventory();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Edit ── */
async function openEditInventory(id) {
  const item = _invAll.find(i => i.id === id);
  if (!item) return;
  openModal('Edit item', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input id="fe-name" class="form-input" value="${esc(item.name||item.material_name||'')}"/></div>
        <div class="form-group"><label class="form-label">SKU</label><input id="fe-sku" class="form-input" value="${esc(item.sku||item.code||'')}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Minimum quantity</label><input id="fe-min" class="form-input" type="number" value="${item.min_quantity||item.minQty||0}"/></div>
        <div class="form-group"><label class="form-label">Unit</label><input id="fe-unit" class="form-input" value="${esc(item.unit||'')}"/></div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitEditInventory(${id})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitEditInventory(id) {
  try {
    await API.inventory.update(id, { name: $('#fe-name')?.value.trim(), sku: $('#fe-sku')?.value.trim(), min_quantity: Number($('#fe-min')?.value)||0, unit: $('#fe-unit')?.value.trim() });
    forceCloseModal(); toast('Item updated'); renderInventory();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Delete ── */
function deleteInventory(id, name) {
  confirm(`Delete <strong>${esc(name)}</strong>? This cannot be undone.`, async () => {
    try { await API.inventory.delete(id); toast('Item deleted'); renderInventory(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
