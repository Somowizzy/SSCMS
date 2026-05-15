let _fgAll = [];

async function renderFinishedGoods() {
  setHTML('#page-content', loading());
  try {
    const res = await API.finishedGoods.list();
    _fgAll    = Array.isArray(res) ? res : (res.items || res.data || []);
    window._pageSearch = q => renderFGTable(_fgAll.filter(i =>
      [i.name, i.product, i.sku, i.category, String(i.id)].some(v => String(v||'').toLowerCase().includes(q.toLowerCase()))
    ));
    buildFGPage(_fgAll);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function buildFGPage(items) {
  const totalUnits = items.reduce((s, i) => s + (Number(i.quantity||i.qty)||0), 0);
  setHTML('#page-content', `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-package"></i></div></div><div class="kpi-val">${fmt(items.length)}</div><div class="kpi-lbl">Product lines</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-packages"></i></div></div><div class="kpi-val">${fmt(totalUnits)}</div><div class="kpi-lbl">Total units in stock</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-alert-triangle"></i></div></div><div class="kpi-val text-amber">${items.filter(i=>(Number(i.quantity||i.qty)||0)<(Number(i.min_quantity||i.reorder_point)||0)).length}</div><div class="kpi-lbl">Low stock</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-truck"></i></div></div><div class="kpi-val">—</div><div class="kpi-lbl">Ready for dispatch</div></div>
    </div>
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">Finished goods register</div>
        <div class="card-hd-act" onclick="openAddFG()"><i class="ti ti-plus"></i> Add</div>
      </div>
      <div id="fg-table"></div>
    </div>
  `);
  renderFGTable(items);
}

function renderFGTable(items) {
  if (!items.length) { setHTML('#fg-table', empty('No finished goods recorded', 'ti-package')); return; }
  setHTML('#fg-table', `
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr>
        <th style="width:80px">SKU</th><th>Product name</th><th style="width:80px">Quantity</th>
        <th style="width:90px">Unit</th><th style="width:100px">Level</th><th style="width:90px">Date added</th><th style="width:90px">Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(i => {
          const qty = Number(i.quantity||i.qty)||0;
          const min = Number(i.min_quantity||i.reorder_point)||0;
          const pct = min ? Math.min(100,(qty/(min*2))*100) : 70;
          const c   = pct < 25 ? '#ef4444' : pct < 50 ? 'var(--amber)' : 'var(--green)';
          return `<tr>
            <td class="mono">${esc(i.sku||i.code||i.id)}</td>
            <td><strong>${esc(i.name||i.product||'—')}</strong><div style="font-size:10.5px;color:var(--txt2)">${esc(i.category||i.type||'')}</div></td>
            <td style="color:${c};font-weight:700">${fmt(qty)}</td>
            <td style="color:var(--txt2)">${esc(i.unit||'units')}</td>
            <td>${progBar(pct,c)}</td>
            ${tdDate(i.created_at||i.createdAt)}
            <td><div style="display:flex;gap:4px">
              <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openEditFG(${i.id})" title="Edit"><i class="ti ti-edit"></i></button>
              <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteFG(${i.id})" title="Delete"><i class="ti ti-trash"></i></button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `);
}

function openAddFG() {
  openModal('Add finished goods', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Product name *</label><input id="fg-name" class="form-input" placeholder="e.g. 28mm PET Preform"/></div>
        <div class="form-group"><label class="form-label">SKU</label><input id="fg-sku" class="form-input" placeholder="FG-028"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity *</label><input id="fg-qty" class="form-input" type="number" min="0" placeholder="0"/></div>
        <div class="form-group"><label class="form-label">Unit</label><select id="fg-unit" class="form-select"><option value="units">units</option><option value="pcs">pcs</option><option value="kg">kg</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Min stock (reorder point)</label><input id="fg-min" class="form-input" type="number" min="0" placeholder="0"/></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddFG()"><i class="ti ti-plus"></i> Add</button>
      </div>
    </div>
  `);
}

async function submitAddFG() {
  const name = $('#fg-name')?.value.trim();
  const qty  = Number($('#fg-qty')?.value)||0;
  if (!name) { toast('Name required', 'error'); return; }
  try {
    await API.finishedGoods.create({ name, sku: $('#fg-sku')?.value.trim(), quantity: qty, unit: $('#fg-unit')?.value, min_quantity: Number($('#fg-min')?.value)||0 });
    forceCloseModal(); toast('Added'); renderFinishedGoods();
  } catch (err) { toast(err.message, 'error'); }
}

function openEditFG(id) {
  const i = _fgAll.find(x => x.id === id);
  if (!i) return;
  openModal('Edit finished goods', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input id="fge-name" class="form-input" value="${esc(i.name||i.product||'')}"/></div>
        <div class="form-group"><label class="form-label">Quantity</label><input id="fge-qty" class="form-input" type="number" value="${i.quantity||i.qty||0}"/></div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitEditFG(${id})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitEditFG(id) {
  try {
    await API.finishedGoods.update(id, { name: $('#fge-name')?.value.trim(), quantity: Number($('#fge-qty')?.value)||0 });
    forceCloseModal(); toast('Updated'); renderFinishedGoods();
  } catch (err) { toast(err.message, 'error'); }
}

function deleteFG(id) {
  confirm('Delete this item?', async () => {
    try { await API.finishedGoods.delete(id); toast('Deleted'); renderFinishedGoods(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
