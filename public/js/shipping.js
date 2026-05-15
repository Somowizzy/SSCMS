let _shipAll = [];

async function renderShipping() {
  setHTML('#page-content', loading());
  try {
    const res = await API.shipping.list();
    _shipAll  = Array.isArray(res) ? res : (res.items || res.data || []);
    window._pageSearch = q => renderShipTable(_shipAll.filter(s =>
      [s.description, s.name, s.destination, s.driver, s.vehicle, String(s.id)].some(v => String(v||'').toLowerCase().includes(q.toLowerCase()))
    ));
    buildShipPage(_shipAll);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function buildShipPage(items) {
  const pending    = items.filter(s => (s.status||'').toLowerCase() === 'pending').length;
  const dispatched = items.filter(s => (s.status||'').toLowerCase() === 'dispatched').length;
  const delivered  = items.filter(s => (s.status||'').toLowerCase() === 'delivered').length;

  setHTML('#page-content', `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-truck"></i></div></div><div class="kpi-val">${fmt(items.length)}</div><div class="kpi-lbl">Total shipments</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clock"></i></div></div><div class="kpi-val text-amber">${fmt(pending)}</div><div class="kpi-lbl">Pending</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-navigation"></i></div></div><div class="kpi-val text-blue">${fmt(dispatched)}</div><div class="kpi-lbl">In transit</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-circle-check"></i></div></div><div class="kpi-val text-green">${fmt(delivered)}</div><div class="kpi-lbl">Delivered</div></div>
    </div>
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">Shipments</div>
        <div style="display:flex;gap:8px">
          <select id="ship-filter" class="form-select" style="width:140px;padding:6px 10px;font-size:12px" onchange="filterShipments()">
            <option value="">All</option><option value="pending">Pending</option><option value="dispatched">In transit</option><option value="delivered">Delivered</option>
          </select>
          <div class="card-hd-act" onclick="openAddShipping()"><i class="ti ti-plus"></i> New</div>
        </div>
      </div>
      <div id="ship-table"></div>
    </div>
  `);
  renderShipTable(items);
}

function filterShipments() {
  const f = $('#ship-filter')?.value;
  renderShipTable(f ? _shipAll.filter(s => (s.status||'').toLowerCase() === f) : _shipAll);
}

function renderShipTable(items) {
  if (!items.length) { setHTML('#ship-table', empty('No shipments found', 'ti-truck')); return; }
  setHTML('#ship-table', `
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr>
        <th style="width:70px">ID</th><th>Description</th><th>Destination</th>
        <th style="width:100px">Driver / Vehicle</th><th style="width:100px">Status</th>
        <th style="width:80px">Date</th><th style="width:100px">Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(s => `
          <tr>
            <td class="mono">#${esc(s.id)}</td>
            <td><strong>${esc(s.description||s.name||'—')}</strong>${s.quantity?`<div style="font-size:10.5px;color:var(--txt2)">${fmt(s.quantity)} ${s.unit||'units'}</div>`:''}</td>
            <td style="color:var(--txt2)">${esc(s.destination||'—')}</td>
            <td style="color:var(--txt2);font-size:11px">${esc(s.driver||'')} ${s.vehicle?'· '+s.vehicle:''}</td>
            <td>${pill(s.status)}</td>
            ${tdDate(s.created_at||s.createdAt)}
            <td><div style="display:flex;gap:4px">
              ${(s.status||'').toLowerCase() === 'pending'    ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--blue2)" onclick="dispatchShipment(${s.id})" title="Dispatch"><i class="ti ti-truck"></i></button>` : ''}
              ${(s.status||'').toLowerCase() === 'dispatched' ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="deliverShipment(${s.id})" title="Mark delivered"><i class="ti ti-check"></i></button>` : ''}
              <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteShipment(${s.id})" title="Delete"><i class="ti ti-trash"></i></button>
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table></div>
  `);
}

function openAddShipping() {
  openModal('New shipment', `
    <div class="form-section">
      <div class="form-group"><label class="form-label">Description *</label><input id="sh-desc" class="form-input" placeholder="What is being shipped?"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input id="sh-qty" class="form-input" type="number" min="0" placeholder="0"/></div>
        <div class="form-group"><label class="form-label">Unit</label><select id="sh-unit" class="form-select"><option value="units">units</option><option value="kg">kg</option><option value="pcs">pcs</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Destination</label><input id="sh-dest" class="form-input" placeholder="Customer / warehouse"/></div>
        <div class="form-group"><label class="form-label">Driver</label><input id="sh-driver" class="form-input" placeholder="Driver name"/></div>
      </div>
      <div class="form-group"><label class="form-label">Vehicle</label><input id="sh-vehicle" class="form-input" placeholder="Truck / plate number"/></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddShipping()"><i class="ti ti-truck"></i> Create shipment</button>
      </div>
    </div>
  `);
}

async function submitAddShipping() {
  const desc = $('#sh-desc')?.value.trim();
  if (!desc) { toast('Description required', 'error'); return; }
  try {
    await API.shipping.create({ description: desc, quantity: Number($('#sh-qty')?.value)||null, unit: $('#sh-unit')?.value, destination: $('#sh-dest')?.value.trim(), driver: $('#sh-driver')?.value.trim(), vehicle: $('#sh-vehicle')?.value.trim(), status: 'pending' });
    forceCloseModal(); toast('Shipment created'); renderShipping();
  } catch (err) { toast(err.message, 'error'); }
}

async function dispatchShipment(id) {
  try { await API.shipping.dispatch(id); toast('Shipment dispatched — in transit'); renderShipping(); }
  catch (err) { toast(err.message, 'error'); }
}

async function deliverShipment(id) {
  try { await API.shipping.deliver(id); toast('Shipment marked as delivered', 'success'); renderShipping(); }
  catch (err) { toast(err.message, 'error'); }
}

function deleteShipment(id) {
  confirm('Delete this shipment record?', async () => {
    try { await API.shipping.delete(id); toast('Deleted'); renderShipping(); }
    catch (err) { toast(err.message, 'error'); }
  });
}
