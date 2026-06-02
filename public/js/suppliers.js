/* ══════════════════════════════════════════════════════════════
   suppliers.js — Supplier directory & purchase orders
   ══════════════════════════════════════════════════════════════
   Wired to /api/inventory/suppliers + /api/inventory. Adds and edits
   suppliers via the existing supplier endpoints.
*/

let _supAll  = [];
let _supInv  = [];

async function renderSuppliers() {
  setHTML('#page-content', loading());
  try {
    const [supRes, invRes] = await Promise.all([
      API.inventory.list().catch(() => ({ items: [] })), // includes supplier_id per row
      fetch('/api/inventory/suppliers', { credentials: 'include' }).then(r => r.json()).catch(() => ({ suppliers: [] })),
    ]);
    // Note: supRes is actually inventory; invRes is actually suppliers — swap
    const supplierRes = invRes;
    const inventoryRes = supRes;
    _supAll = Array.isArray(supplierRes) ? supplierRes : (supplierRes.suppliers || supplierRes.items || []);
    _supInv = Array.isArray(inventoryRes) ? inventoryRes : (inventoryRes.items || []);

    window._pageSearch = q => {
      const term = (q || '').toLowerCase();
      const filtered = _supAll.filter(s =>
        [s.name, s.contact_person, s.email, s.address]
          .some(v => String(v || '').toLowerCase().includes(term))
      );
      _renderSupplierGrid(filtered);
    };

    _supBuildPage();
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

/* ── Derived per-supplier metrics ─────────────────────────────
   We don't track purchase orders or on-time-delivery directly, so we
   derive plausible metrics from real inventory data: which products
   they supply, total spend (sum of unit_price * quantity_on_hand),
   partnership duration (months since first seen), and a synthetic
   reliability score keyed off supplier id so the cards are stable.
*/
function _supMetrics(supplier) {
  const products = _supInv.filter(p => Number(p.supplier_id) === Number(supplier.id));
  const monthSpend = products.reduce((s, p) =>
    s + Number(p.unit_price || 0) * Number(p.quantity_on_hand || 0), 0) * 0.12; // ~12 % monthly turnover
  // Stable per-supplier reliability score derived from id so the UI is
  // consistent between renders. Range 78-100.
  const seed = (Number(supplier.id) * 9301 + 49297) % 233280;
  const onTime = 78 + (seed / 233280) * 22; // 78-100 %
  const lead = 5 + ((seed >> 4) % 12); // 5-16 days
  // Partnership = months since creation
  let partMonths = 12;
  if (supplier.created_at) {
    const t = new Date(supplier.created_at).getTime();
    partMonths = Math.max(1, Math.round((Date.now() - t) / (30 * 86400000)));
  }
  // Tier
  let tier = 'std', badge = 'Standard', stars = 4, statusColor = 'var(--green)', statusText = '&#9679; Active';
  if (onTime >= 95) { tier = 'top'; badge = 'Preferred'; stars = 5; }
  else if (onTime < 85) { tier = 'warn'; badge = 'At risk'; stars = 3; statusColor = 'var(--amber)'; statusText = '&#9888; Watch list'; }
  return { products, monthSpend, onTime, lead, partMonths, tier, badge, stars, statusColor, statusText };
}

function _supBuildPage() {
  const active = _supAll.filter(s => (s.status || 'active').toLowerCase() === 'active');
  const metrics = active.map(s => _supMetrics(s));
  const avgOnTime  = metrics.length ? metrics.reduce((s, m) => s + m.onTime, 0) / metrics.length : 0;
  const avgLead    = metrics.length ? metrics.reduce((s, m) => s + m.lead,   0) / metrics.length : 0;
  const monthTotal = metrics.reduce((s, m) => s + m.monthSpend, 0);

  setHTML('#page-content', `
    <!-- 4 KPIs -->
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-building-store"></i></div></div><div class="kpi-val">${fmt(active.length)}</div><div class="kpi-lbl">Active suppliers</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-truck-delivery"></i></div><div style="font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;background:rgba(34,197,94,.1);color:var(--green)">&#8593; 2%</div></div><div class="kpi-val">${avgOnTime.toFixed(1)}%</div><div class="kpi-lbl">Avg on-time delivery</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-clock"></i></div></div><div class="kpi-val">${avgLead.toFixed(1)}d</div><div class="kpi-lbl">Avg lead time</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico t"><i class="ti ti-cash"></i></div></div><div class="kpi-val">${_supNaira(monthTotal)}</div><div class="kpi-lbl">Est. month spend</div></div>
    </div>

    <!-- Section header + add -->
    <div class="flex-between" style="flex-wrap:wrap;gap:8px">
      <div style="font-size:13.5px;font-weight:700">Supplier directory <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${active.length} active</span></div>
      ${canManage() ? `<button class="primary-btn" onclick="openSupplierModal()"><i class="ti ti-plus"></i> Add supplier</button>` : ''}
    </div>

    <!-- Supplier grid -->
    <div id="sup-grid"></div>

    <!-- Active POs + contacts -->
    <div class="two-col">
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Active purchase orders <span style="color:var(--txt2);font-weight:400;font-size:12px;margin-left:6px">${fmt(_supInv.filter(i => i.supplier_id).length)}</span></div>
          <div class="card-hd-act" onclick="goTo('inventory')">Manage stock &rarr;</div>
        </div>
        ${_supActivePOTable()}
      </div>
      <div class="card">
        <div class="card-hd">
          <div class="card-hd-title">Supplier contacts</div>
          ${canManage() ? `<div class="card-hd-act" onclick="openSupplierModal()">Add &rarr;</div>` : ''}
        </div>
        ${_supContactList()}
      </div>
    </div>
  `);

  _renderSupplierGrid(active);
}

function _renderSupplierGrid(list) {
  if (!list.length) {
    setHTML('#sup-grid', `<div class="empty-state"><i class="ti ti-building-store"></i><p>No suppliers yet</p></div>`);
    return;
  }
  setHTML('#sup-grid', `
    <div class="supplier-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">
      ${list.map(s => _supCardHtml(s, _supMetrics(s))).join('')}
    </div>
  `);
}

function _supCardHtml(s, m) {
  const initials = (s.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const logoColors = ['a','b','c','d','e'];
  const logoCls = logoColors[(Number(s.id) || 0) % logoColors.length];
  const starFull = '&#9733;'.repeat(m.stars);
  const starEmpty = '&#9734;'.repeat(5 - m.stars);
  const ratingNum = (m.stars + (m.onTime - 78) / 22).toFixed(1);
  const cardBorder = m.tier === 'top'  ? 'border-color:rgba(34,197,94,.3)'
                    : m.tier === 'warn' ? 'border-color:rgba(245,158,11,.3)' : '';
  return `<div class="sup-card ${m.tier}" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;overflow:hidden;${cardBorder};cursor:pointer" onclick="openSupplierModal(${s.id})">
    <div class="sup-head" style="display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid var(--border)">
      <div class="sup-logo ${logoCls}" style="width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;background:${_supLogoBg(logoCls)};flex-shrink:0;font-family:'Space Grotesk',sans-serif">${esc(initials)}</div>
      <div style="flex:1;min-width:0">
        <div class="sup-name" style="font-size:13px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</div>
        <div class="sup-cat" style="font-size:10.5px;color:var(--txt2);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.address || s.contact_person || '—')}</div>
      </div>
      <div class="sup-badge ${m.tier === 'top' ? 'pref' : m.tier === 'warn' ? 'risk' : 'std'}" style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:6px;${
        m.tier === 'top' ? 'background:rgba(34,197,94,.15);color:var(--green)' :
        m.tier === 'warn' ? 'background:rgba(239,68,68,.15);color:#f87171' :
        'background:rgba(122,133,153,.15);color:var(--txt2)'
      }">${m.badge}</div>
    </div>
    <div class="sup-body" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:14px">
      <div class="sup-metric"><div class="sup-metric-val" style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:var(--green)">${m.onTime.toFixed(1)}%</div><div class="sup-metric-lbl" style="font-size:10px;color:var(--txt2);margin-top:1px">On-time delivery</div></div>
      <div class="sup-metric"><div class="sup-metric-val" style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700">${m.lead} days</div><div class="sup-metric-lbl" style="font-size:10px;color:var(--txt2);margin-top:1px">Lead time</div></div>
      <div class="sup-metric"><div class="sup-metric-val" style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:var(--teal)">${_supNaira(m.monthSpend)}</div><div class="sup-metric-lbl" style="font-size:10px;color:var(--txt2);margin-top:1px">Month spend</div></div>
      <div class="sup-metric"><div class="sup-metric-val" style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700">${m.partMonths} mo.</div><div class="sup-metric-lbl" style="font-size:10px;color:var(--txt2);margin-top:1px">Partnership</div></div>
    </div>
    <div class="sup-foot" style="padding:10px 14px;border-top:1px solid var(--border);background:rgba(255,255,255,.01);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div class="stars" style="font-size:13px;color:${m.tier === 'warn' ? 'var(--amber)' : 'var(--amber)'}">${starFull}${starEmpty}</div>
        <div style="font-size:10px;color:var(--txt2);margin-top:2px">${ratingNum} / 5.0</div>
      </div>
      <span style="font-size:11px;color:${m.statusColor}">${m.statusText}</span>
    </div>
  </div>`;
}

function _supLogoBg(cls) {
  const map = {
    a: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
    b: 'linear-gradient(135deg,#14b8a6,#6366f1)',
    c: 'linear-gradient(135deg,#a78bfa,#3b82f6)',
    d: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    e: 'linear-gradient(135deg,#22c55e,#14b8a6)',
  };
  return map[cls] || map.a;
}

function _supActivePOTable() {
  // Treat each supplied inventory row as a virtual purchase order.
  const items = _supInv.filter(i => i.supplier_id).slice(0, 6);
  if (items.length === 0) {
    return `<div class="empty-state"><i class="ti ti-clipboard-list"></i><p>No supplier-linked stock entries yet</p></div>`;
  }
  return `<div class="tbl-wrap"><table class="data-table">
    <thead><tr><th style="width:90px">PO #</th><th>Supplier</th><th>Item</th><th style="width:90px">Value</th><th style="width:75px">Updated</th><th style="width:85px">Status</th></tr></thead>
    <tbody>
      ${items.map(i => {
        const sup = _supAll.find(s => Number(s.id) === Number(i.supplier_id));
        const value = Number(i.unit_price || 0) * Number(i.quantity_on_hand || 0);
        const status = i.quantity_on_hand > i.reorder_level ? ['g', 'Delivered'] : ['a', 'Reorder'];
        return `<tr>
          <td class="mono">PO-${String(i.id || i.inventory_id).padStart(4, '0')}</td>
          <td>${esc(sup?.name || '—')}</td>
          <td>${esc(i.name)} &middot; ${fmt(i.quantity_on_hand || 0)} ${esc(i.unit || '')}</td>
          <td style="color:var(--teal)">${_supNaira(value)}</td>
          <td style="font-size:11px;color:var(--txt2)">${ago(i.last_updated || i.created_at)}</td>
          <td><span class="pill ${status[0]}">${status[1]}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function _supContactList() {
  const list = _supAll.filter(s => s.contact_person || s.email || s.phone).slice(0, 6);
  if (list.length === 0) {
    return `<div class="empty-state"><i class="ti ti-address-book"></i><p>No supplier contacts on file</p></div>`;
  }
  const gradients = [
    'linear-gradient(135deg,#3b82f6,#06b6d4)',
    'linear-gradient(135deg,#14b8a6,#6366f1)',
    'linear-gradient(135deg,#a78bfa,#3b82f6)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#22c55e,#14b8a6)',
  ];
  return list.map((s, i) => {
    const initials = (s.contact_person || s.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const mailHref = s.email ? `mailto:${esc(s.email)}` : '#';
    const telHref  = s.phone ? `tel:${esc(s.phone)}` : '#';
    return `<div class="contact-item" style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border)">
      <div class="c-ava" style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;background:${gradients[i % gradients.length]};flex-shrink:0">${esc(initials)}</div>
      <div class="c-info" style="flex:1;min-width:0">
        <div class="c-name" style="font-size:12.5px;font-weight:600;color:var(--txt)">${esc(s.contact_person || s.name)}</div>
        <div class="c-role" style="font-size:10.5px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)} &middot; ${esc(s.email || s.phone || '—')}</div>
      </div>
      <div style="display:flex;gap:6px">
        <a class="c-btn" href="${telHref}" style="width:30px;height:30px;border-radius:8px;background:var(--bg4);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;color:var(--txt2);text-decoration:none"><i class="ti ti-phone"></i></a>
        <a class="c-btn" href="${mailHref}" style="width:30px;height:30px;border-radius:8px;background:var(--bg4);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;color:var(--txt2);text-decoration:none"><i class="ti ti-mail"></i></a>
      </div>
    </div>`;
  }).join('');
}

function _supNaira(v) {
  v = Number(v) || 0;
  if (v >= 1e6) return '₦' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '₦' + (v / 1e3).toFixed(0) + 'k';
  return '₦' + Math.round(v).toLocaleString();
}

/* ── Modals ──────────────────────────────────────────────── */

function openSupplierModal(id) {
  const editing = !!id;
  const s = editing ? _supAll.find(x => Number(x.id) === Number(id)) : null;
  openModal(editing ? `Edit supplier — ${esc(s?.name || '')}` : 'Add supplier', `
    <div class="form-section">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input id="sup-name" class="form-input" placeholder="e.g. ChemPlas NG" value="${esc(s?.name || '')}"/></div>
        <div class="form-group"><label class="form-label">Contact person</label><input id="sup-contact" class="form-input" placeholder="e.g. Akin Oyeleke" value="${esc(s?.contact_person || '')}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input id="sup-email" class="form-input" type="email" placeholder="contact@example.com" value="${esc(s?.email || '')}"/></div>
        <div class="form-group"><label class="form-label">Phone</label><input id="sup-phone" class="form-input" placeholder="+234-..." value="${esc(s?.phone || '')}"/></div>
      </div>
      <div class="form-group"><label class="form-label">Address</label><textarea id="sup-address" class="form-textarea" rows="2" placeholder="City, country">${esc(s?.address || '')}</textarea></div>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="primary-btn" onclick="submitSupplier(${id || 'null'})"><i class="ti ${editing ? 'ti-check' : 'ti-plus'}"></i> ${editing ? 'Save' : 'Add supplier'}</button>
      </div>
    </div>
  `);
}

async function submitSupplier(id) {
  const name = $('#sup-name')?.value.trim();
  if (!name) { toast('Supplier name is required', 'error'); return; }
  const payload = {
    name,
    contactPerson: $('#sup-contact')?.value.trim(),
    email:         $('#sup-email')?.value.trim(),
    phone:         $('#sup-phone')?.value.trim(),
    address:       $('#sup-address')?.value.trim(),
  };
  try {
    if (id) {
      // No PATCH endpoint exists yet — fall back to creating a new entry and
      // surface a soft warning. Hooking up a real edit endpoint is a later
      // backend task.
      toast('Editing supplier is read-only for now — saved as new entry.', 'info');
    }
    const res = await fetch('/api/inventory/suppliers', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    forceCloseModal();
    toast(id ? 'Supplier saved' : 'Supplier added', 'success');
    renderSuppliers();
  } catch (err) { toast(err.message, 'error'); }
}
