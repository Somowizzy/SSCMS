let _prodAll = [];

async function renderProduction() {
  setHTML('#page-content', loading());
  try {
    const [res, invRes] = await Promise.all([
      API.production.list(),
      API.inventory.list().catch(() => []),
    ]);
    _prodAll = Array.isArray(res) ? res : (res.items || res.data || []);
    const inv = Array.isArray(invRes) ? invRes : (invRes.items || []);
    window._pageSearch = q => renderProdTable(_prodAll.filter(p =>
      [p.name, p.product, p.machine, p.operator, String(p.id)].some(v => String(v||'').toLowerCase().includes(q.toLowerCase()))
    ));
    buildProdPage(_prodAll, inv);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function buildProdPage(runs, inv) {
  const active    = runs.filter(r => ['active','running','in-progress'].includes((r.status||'').toLowerCase())).length;
  const completed = runs.filter(r => (r.status||'').toLowerCase() === 'completed').length;
  const rejected  = runs.reduce((s, r) => s + (Number(r.rejected_qty || r.rejectedQty) || 0), 0);
  const rpetKg    = runs.reduce((s, r) => s + (Number(r.rpet_kg || r.rpetKg) || 0), 0);

  setHTML('#page-content', `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-settings-2"></i></div></div><div class="kpi-val">${fmt(runs.length)}</div><div class="kpi-lbl">Total runs</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-activity"></i></div></div><div class="kpi-val text-green">${fmt(active)}</div><div class="kpi-lbl">Active runs</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-alert-circle"></i></div></div><div class="kpi-val text-red">${fmt(rejected)}</div><div class="kpi-lbl">Total rejections</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-recycle"></i></div></div><div class="kpi-val text-teal">${fmtKg(rpetKg)}</div><div class="kpi-lbl">R-PET recycled</div></div>
    </div>

    <!-- R-PET Flow Diagram -->
    <div class="card" style="border-color:rgba(20,184,166,.2)">
      <div class="card-hd" style="background:rgba(20,184,166,.04)">
        <div class="card-hd-title" style="color:var(--teal)">&#9851; R-PET Recycling Flow</div>
        <div class="card-hd-act" onclick="openRpetLogModal()">View R-PET log &rarr;</div>
      </div>
      <div class="flow-canvas">
        <div class="flow-node prod"><div class="fn-icon">&#127981;</div><div class="fn-title">Production Floor</div><div class="fn-sub">Units manufactured</div><div class="fn-badge b">${active} active runs</div></div>
        <div class="flow-arr"><div class="arr-line"></div><span style="font-size:12px;color:var(--txt3)">&#9658;</span></div>
        <div class="flow-node qc"><div class="fn-icon">&#128300;</div><div class="fn-title">QC Inspection</div><div class="fn-sub">Batch tested &amp; rejections separated</div></div>
        <div class="flow-arr"><div class="arr-line red"></div><span style="font-size:12px;color:#f87171">&#9658;</span><div class="arr-label" style="color:#f87171">Rejected</div></div>
        <div class="flow-node reject"><div class="fn-icon">&#9940;</div><div class="fn-title">Rejection Bin</div><div class="fn-sub">Defective units collected</div><div class="fn-badge r">${fmt(rejected)} units total</div></div>
        <div class="flow-arr"><div class="arr-line" style="background:rgba(239,68,68,.4)"></div><span style="font-size:12px;color:#f87171">&#9658;</span><div class="arr-label">Weighed &amp; logged</div></div>
        <div class="flow-node weigh"><div class="fn-icon">&#9878;&#65039;</div><div class="fn-title">Weighing Station</div><div class="fn-sub">Weight logged in SSCMS</div></div>
        <div class="flow-arr"><div class="arr-line teal"></div><span style="font-size:12px;color:var(--teal)">&#9658;</span><div class="arr-label">To Raw Mat.</div></div>
        <div class="flow-node grind"><div class="fn-icon">&#9881;&#65039;</div><div class="fn-title">Grinding Unit</div><div class="fn-sub">Ground into R-PET flakes</div><div class="fn-badge t">~95% yield</div></div>
        <div class="flow-arr"><div class="arr-line teal"></div><span style="font-size:12px;color:var(--teal)">&#9658;</span><div class="arr-label">R-PET ready</div></div>
        <div class="flow-node rpet"><div class="fn-icon">&#9851;&#65039;</div><div class="fn-title">R-PET Inventory</div><div class="fn-sub">Added to MAT-RPET stock</div><div class="fn-badge t">${fmtKg(rpetKg)} total</div></div>
        <div class="flow-arr"><div class="arr-line teal"></div><span style="font-size:12px;color:var(--teal)">&#9658;</span><div class="arr-label">Blended</div></div>
        <div class="flow-node prod"><div class="fn-icon">&#128260;</div><div class="fn-title">Back to Production</div><div class="fn-sub">R-PET blended with virgin material</div><div class="fn-badge g">Closed loop &#10003;</div></div>
      </div>
      <div style="padding:0 20px 16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="primary-btn" style="background:var(--teal)" onclick="openLogRejectionModal()"><i class="ti ti-arrow-down"></i> Log rejection batch</button>
        <button class="sec-btn" onclick="openRpetRequestModal()"><i class="ti ti-recycle"></i> Request R-PET for run</button>
      </div>
    </div>

    <!-- Production runs table -->
    <div class="card">
      <div class="card-hd">
        <div class="card-hd-title">Production runs <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${runs.length} total</span></div>
        <div class="card-hd-act" onclick="openAddProduction()"><i class="ti ti-plus"></i> New run</div>
      </div>
      <div id="prod-table"></div>
    </div>
  `);
  renderProdTable(runs);
}

function renderProdTable(runs) {
  if (!runs.length) { setHTML('#prod-table', empty('No production runs yet', 'ti-settings-2')); return; }
  setHTML('#prod-table', `
    <div class="tbl-wrap">
      <table class="data-table">
        <thead><tr>
          <th style="width:80px">Run ID</th><th>Product / Name</th><th style="width:100px">Machine</th>
          <th style="width:80px">Target</th><th style="width:80px">Produced</th><th style="width:80px">Rejected</th>
          <th style="width:80px">R-PET kg</th><th style="width:100px">Status</th><th style="width:70px">Date</th><th style="width:90px">Actions</th>
        </tr></thead>
        <tbody>
          ${runs.map(r => {
            const produced = r.produced_qty || r.producedQty || r.actual_qty || 0;
            const target   = r.target_qty   || r.targetQty   || r.quantity   || 0;
            const rejected = r.rejected_qty || r.rejectedQty || 0;
            const rpetKg   = r.rpet_kg      || r.rpetKg      || 0;
            const pct = target ? Math.round((produced/target)*100) : 0;
            return `<tr>
              <td class="mono">#${esc(r.id)}</td>
              <td><strong>${esc(r.product||r.name||'—')}</strong></td>
              <td style="color:var(--txt2)">${esc(r.machine||r.machine_id||'—')}</td>
              <td>${fmt(target)}</td>
              <td>${fmt(produced)}</td>
              <td style="color:${rejected>0?'#f87171':'var(--txt2)'}">${fmt(rejected)}</td>
              <td style="color:var(--teal)">${rpetKg ? fmtKg(rpetKg) : '—'}</td>
              <td>${pill(r.status)}</td>
              ${tdDate(r.created_at||r.createdAt||r.date)}
              <td>
                <div style="display:flex;gap:4px">
                  ${['active','running','in-progress'].includes((r.status||'').toLowerCase())
                    ? `<button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:var(--green)" onclick="openCompleteRun(${r.id})" title="Complete"><i class="ti ti-check"></i></button>` : ''}
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px" onclick="openEditRun(${r.id})" title="Edit"><i class="ti ti-edit"></i></button>
                  <button class="icon-btn" style="width:26px;height:26px;font-size:12px;color:#f87171" onclick="deleteRun(${r.id})" title="Delete"><i class="ti ti-trash"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `);
}

/* ── Add run ── */
// The 9 production machines
const PROD_MACHINES = [
  'Husky P1', 'Husky P2', 'Husky P3', 'Husky P4', 'Husky P5', 'Husky P6',
  'SACMI S1', 'SACMI S2', 'IPS'
];

// Preform catalog grouped by customer (names match the seeded catalog exactly)
const PREFORMS_BY_CUSTOMER = {
  'Nigerian Breweries': [
    'Maltina Preform (Amber)',
    'Amstel Malta Preform (Amber)',
    'Fayrouz Preform (Amber)',
  ],
  'Nestlé': [
    'Pure Life Water Preform (Blue)',
  ],
  'Nigerian Bottling Company': [
    'Coke / Fanta / Sprite Preform (Clear)',
    'Eva Water Preform (Crystal White)',
    'Schweppes Preform (Clear)',
    'Predator Energy Preform (Clear)',
  ],
  'Rite Foods': [
    'Bigi Cola / Apple / Orange / Tropical Preform (Clear)',
    'Fearless Energy Drink Preform (Green)',
    'Bigi Premium Table Water Preform (Crystal White)',
  ],
};

// Repopulate the preform dropdown when the customer changes
function _fpCustomerChange() {
  const cust = $('#fp-customer')?.value;
  const prodSel = $('#fp-product');
  const customWrap = $('#fp-product-custom-wrap');
  if (!prodSel) return;

  if (cust === '__custom__') {
    prodSel.innerHTML = '<option value="">— Custom (enter name below) —</option>';
    prodSel.disabled = true;
    if (customWrap) customWrap.style.display = '';
  } else {
    const list = PREFORMS_BY_CUSTOMER[cust] || [];
    prodSel.disabled = false;
    prodSel.innerHTML = list.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (customWrap) customWrap.style.display = 'none';
  }
}

async function openAddProduction() {
  const customers = Object.keys(PREFORMS_BY_CUSTOMER);
  const firstCustomerPreforms = PREFORMS_BY_CUSTOMER[customers[0]] || [];

  openModal('New production run', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Customer *</label>
          <select id="fp-customer" class="form-select" onchange="_fpCustomerChange()">
            ${customers.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            <option value="__custom__">+ Other (custom product)…</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Preform *</label>
          <select id="fp-product" class="form-select">
            ${firstCustomerPreforms.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" id="fp-product-custom-wrap" style="display:none">
        <label class="form-label">Custom product name *</label>
        <input id="fp-product-custom" class="form-input" placeholder="e.g. 28mm Preform (Clear)"/>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Machine *</label>
          <select id="fp-machine" class="form-select">
            ${PROD_MACHINES.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Target quantity *</label><input id="fp-target" class="form-input" type="number" min="1" placeholder="e.g. 85000"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="fp-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitAddProduction()"><i class="ti ti-plus"></i> Start run</button>
      </div>
    </div>
  `);
}

async function submitAddProduction() {
  const cust = $('#fp-customer')?.value;
  const product = cust === '__custom__'
    ? $('#fp-product-custom')?.value.trim()
    : ($('#fp-product')?.value || '').trim();
  const machine = $('#fp-machine')?.value;
  const target  = Number($('#fp-target')?.value);
  if (!product) { toast('Please select or enter a preform', 'error'); return; }
  if (!target)  { toast('Target quantity is required', 'error'); return; }
  try {
    await API.production.create({ productName: product, machine, quantityRequested: target, notes: $('#fp-notes')?.value.trim() });
    forceCloseModal(); toast('Production run started'); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Complete run ── */
function openCompleteRun(id) {
  const run = _prodAll.find(r => r.id === id);
  openModal('Complete production run', `
    <div class="form-section">
      <div class="req-info">Completing run #${id}. Enter the final counts. Rejected units will be logged for R-PET processing.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Units produced</label><input id="fc-produced" class="form-input" type="number" min="0" value="${run?.target_qty||run?.targetQty||0}"/></div>
        <div class="form-group"><label class="form-label">Units rejected (→ R-PET)</label><input id="fc-rejected" class="form-input" type="number" min="0" value="0"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">R-PET weight (kg) from rejections</label><input id="fc-rpet" class="form-input" type="number" min="0" step="0.1" placeholder="Auto-calc at 0.95 kg/unit"/></div>
        <div class="form-group"><label class="form-label">QC pass rate (%)</label><input id="fc-qc" class="form-input" type="number" min="0" max="100" placeholder="e.g. 98.5"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="fc-notes" class="form-textarea" rows="2"></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--green)" onclick="submitCompleteRun(${id})"><i class="ti ti-check"></i> Complete run</button>
      </div>
    </div>
  `);
  // Auto-calculate R-PET kg
  $('#fc-rejected')?.addEventListener('input', e => {
    const rejected = Number(e.target.value)||0;
    if (!$('#fc-rpet').value) $('#fc-rpet').placeholder = `~${(rejected*0.95).toFixed(1)} kg`;
  });
}

async function submitCompleteRun(id) {
  const produced = Number($('#fc-produced')?.value)||0;
  const rejected = Number($('#fc-rejected')?.value)||0;
  const rpetKg   = Number($('#fc-rpet')?.value)   || (rejected * 0.95);
  try {
    await API.production.complete(id, { produced_qty: produced, rejected_qty: rejected, rpet_kg: rpetKg, qc_pass_rate: Number($('#fc-qc')?.value)||null, notes: $('#fc-notes')?.value.trim(), status: 'completed' });
    forceCloseModal(); toast('Run completed. Rejected units queued for R-PET processing.', 'success', 4000); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── Edit run ── */
function openEditRun(id) {
  const r = _prodAll.find(x => x.id === id);
  if (!r) return;
  openModal('Edit run', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Product</label><input id="fe-product" class="form-input" value="${esc(r.product||r.name||'')}"/></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select id="fe-status" class="form-select">
            ${['active','paused','completed','cancelled'].map(s => `<option value="${s}" ${(r.status||'')===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitEditRun(${id})"><i class="ti ti-check"></i> Save</button>
      </div>
    </div>
  `);
}

async function submitEditRun(id) {
  try {
    await API.production.update(id, { product: $('#fe-product')?.value.trim(), status: $('#fe-status')?.value });
    forceCloseModal(); toast('Run updated'); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

function deleteRun(id) {
  confirm('Delete this production run? This cannot be undone.', async () => {
    try { await API.production.delete(id); toast('Run deleted'); renderProduction(); }
    catch (err) { toast(err.message, 'error'); }
  });
}

/* ── Log rejection ── */
function openLogRejectionModal() {
  openModal('Log rejection batch → R-PET', `
    <div class="form-section">
      <div class="req-info">&#9851; Log rejected units from a production batch. They will be weighed and sent to the Raw Materials department for grinding into R-PET.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Production run</label>
          <select id="lr-run" class="form-select">
            ${_prodAll.map(r => `<option value="${r.id}">#${r.id} — ${esc(r.product||r.name||'')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Units rejected</label><input id="lr-units" class="form-input" type="number" min="1" placeholder="e.g. 542"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Weight (kg) — leave blank to auto-calc</label><input id="lr-kg" class="form-input" type="number" min="0" step="0.1" placeholder="~0.95 kg/unit"/></div>
        <div class="form-group"><label class="form-label">Rejection reason</label>
          <select id="lr-reason" class="form-select">
            <option>Wall thickness defect</option><option>Weight out of tolerance</option>
            <option>Thread integrity failure</option><option>Color inconsistency</option>
            <option>Surface defect</option><option>Other</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--teal)" onclick="submitLogRejection()"><i class="ti ti-recycle"></i> Log &amp; queue for grinding</button>
      </div>
    </div>
  `);
  $('#lr-units')?.addEventListener('input', e => {
    const u = Number(e.target.value)||0;
    if (!$('#lr-kg').value) $('#lr-kg').placeholder = `~${(u*0.95).toFixed(1)} kg`;
  });
}

async function submitLogRejection() {
  const runId = $('#lr-run')?.value;
  const units = Number($('#lr-units')?.value)||0;
  if (!units) { toast('Enter number of rejected units', 'error'); return; }
  const kg = Number($('#lr-kg')?.value) || units * 0.95;
  try {
    // Update production run with rejection data
    const run = _prodAll.find(r => String(r.id) === String(runId));
    if (run) {
      const newRejected = (Number(run.rejected_qty)||0) + units;
      const newRpet     = (Number(run.rpet_kg)||0) + kg;
      await API.production.update(runId, { rejected_qty: newRejected, rpet_kg: newRpet });
    }
    forceCloseModal(); toast(`${units} units logged → ${kg.toFixed(1)} kg queued for R-PET grinding`, 'success', 5000); renderProduction();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── R-PET request modal ── */
function openRpetRequestModal() {
  openModal('Request R-PET for production run', `
    <div class="form-section">
      <div class="req-info">&#9851; Request R-PET (recycled material) from the Raw Materials department to blend with virgin material during production. Max blend ratio: 30%.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Production run</label>
          <select id="rr-run" class="form-select">
            ${_prodAll.filter(r => ['active','running','in-progress'].includes((r.status||'').toLowerCase()))
              .map(r => `<option value="${r.id}">#${r.id} — ${esc(r.product||r.name||'')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">R-PET quantity (kg)</label><input id="rr-qty" class="form-input" type="number" min="1" placeholder="e.g. 400"/></div>
      </div>
      <div class="form-group"><label class="form-label">Blend ratio</label>
        <select id="rr-blend" class="form-select">
          <option value="10">10% R-PET blend</option><option value="20" selected>20% R-PET blend</option><option value="30">30% R-PET blend (maximum)</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Notes for Raw Materials dept.</label><textarea id="rr-notes" class="form-textarea" rows="2" placeholder="Any special requirements..."></textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" style="background:var(--teal)" onclick="submitRpetRequest()"><i class="ti ti-send"></i> Submit request</button>
      </div>
    </div>
  `);
}

async function submitRpetRequest() {
  const runId = $('#rr-run')?.value;
  const qty   = Number($('#rr-qty')?.value)||0;
  if (!qty) { toast('Enter R-PET quantity', 'error'); return; }
  try {
    await API.requests.create({
      type: 'rpet', description: `R-PET request for production run #${runId}`,
      quantity: qty, unit: 'kg',
      blend_ratio: $('#rr-blend')?.value,
      production_run_id: runId,
      notes: $('#rr-notes')?.value.trim(),
    });
    forceCloseModal(); toast('R-PET request submitted to Raw Materials dept.', 'success', 4000); refreshBadges();
  } catch (err) { toast(err.message, 'error'); }
}

/* ── R-PET log ── */
function openRpetLogModal() {
  const rpetRuns = _prodAll.filter(r => (Number(r.rpet_kg)||Number(r.rejectedQty)||0) > 0);
  const totalKg  = rpetRuns.reduce((s,r) => s+(Number(r.rpet_kg||r.rpetKg)||0), 0);
  openModal('R-PET recycling log', `
    <div class="form-section">
      <div style="display:flex;gap:12px;margin-bottom:4px">
        <div style="background:rgba(20,184,166,.08);border:1px solid rgba(20,184,166,.2);border-radius:10px;padding:12px 16px;flex:1;text-align:center">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:var(--teal)">${fmtKg(totalKg)}</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:3px">Total R-PET recycled</div>
        </div>
        <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:12px 16px;flex:1;text-align:center">
          <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:var(--green)">${fmt(rpetRuns.length)}</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:3px">Runs with recycling</div>
        </div>
      </div>
      ${rpetRuns.length === 0 ? empty('No R-PET data yet', 'ti-recycle') : `
        <div class="tbl-wrap"><table class="data-table">
          <thead><tr><th>Run</th><th>Product</th><th>Rejected units</th><th>R-PET (kg)</th><th>Date</th></tr></thead>
          <tbody>
            ${rpetRuns.map(r => `<tr>
              <td class="mono">#${esc(r.id)}</td>
              <td>${esc(r.product||r.name||'—')}</td>
              <td style="color:#f87171">${fmt(r.rejected_qty||r.rejectedQty||0)}</td>
              <td style="color:var(--teal);font-weight:700">${fmtKg(r.rpet_kg||r.rpetKg||0)}</td>
              ${tdDate(r.updated_at||r.updatedAt||r.created_at)}
            </tr>`).join('')}
          </tbody>
        </table></div>`}
    </div>
  `, true);
}
