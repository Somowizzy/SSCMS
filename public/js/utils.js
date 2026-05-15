/* ── Formatting ─────────────────────────────────────────── */
const fmt   = n => (n == null ? '—' : Number(n).toLocaleString());
const fmtKg = n => { if (n == null) return '—'; const v = Number(n); return v >= 1000 ? (v/1000).toFixed(1)+' t' : v.toLocaleString()+' kg'; };
const fmtM  = (n, sym='₦') => { if (n == null) return '—'; const v = Number(n); if (v >= 1e6) return sym+(v/1e6).toFixed(1)+'M'; if (v >= 1e3) return sym+(v/1e3).toFixed(0)+'k'; return sym+v.toLocaleString(); };
const fmtPct= n => n == null ? '—' : Number(n).toFixed(1)+'%';
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}); };
const fmtDT   = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('en-NG',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); };
const ago = s => { if (!s) return ''; const m = Math.floor((Date.now()-new Date(s))/60000); if (m < 1) return 'just now'; if (m < 60) return m+'m ago'; const h = Math.floor(m/60); if (h < 24) return h+'h ago'; return Math.floor(h/24)+'d ago'; };

/* ── Status pill ────────────────────────────────────────── */
const PILL_MAP = {
  active:'g', approved:'g', completed:'g', delivered:'g', 'in-stock':'g',
  pending:'a', 'in-progress':'a', low:'a', 'low-stock':'a', dispatched:'a',
  processing:'b', running:'b', grinding:'t', issued:'t',
  inactive:'gr', idle:'gr', cancelled:'r', rejected:'r', 'out-of-stock':'r',
  critical:'r', delayed:'r', failed:'r',
};
function pill(status, label) {
  const s = String(status || '').toLowerCase();
  const cls = PILL_MAP[s] || 'gr';
  const txt = label || (status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : '—');
  return `<span class="pill ${cls}">${txt}</span>`;
}

/* ── Progress bar ───────────────────────────────────────── */
function progBar(pct, color) {
  const w = Math.min(100, Math.max(0, pct || 0));
  const c = color || (w >= 60 ? 'var(--green)' : w >= 30 ? 'var(--amber)' : '#ef4444');
  return `<div class="prog"><div class="prog-f" style="width:${w}%;background:${c}"></div></div>`;
}
function invLevel(qty, minQty) {
  if (!minQty) return progBar(50);
  const pct = Math.min(100, (qty / (minQty * 2)) * 100);
  return progBar(pct);
}

/* ── Sparkline ──────────────────────────────────────────── */
function spark(data, color = '#60a5fa', fill = 'rgba(59,130,246,.1)') {
  if (!data || data.length < 2) return '';
  const max = Math.max(...data, 1), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i/(data.length-1))*120},${32-((v-min)/(max-min||1))*(32-4)-2}`).join(' ');
  return `<svg viewBox="0 0 120 32" preserveAspectRatio="none"><polyline fill="${fill}" stroke="none" points="0,32 ${pts} 120,32"/><polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" points="${pts}"/></svg>`;
}

/* ── DOM ────────────────────────────────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const setHTML = (s, h) => { const e = typeof s === 'string' ? $(s) : s; if (e) e.innerHTML = h; };
const setText = (s, t) => { const e = typeof s === 'string' ? $(s) : s; if (e) e.textContent = t; };
const show  = s => { const e = typeof s === 'string' ? $(s) : s; if (e) e.style.display = ''; };
const hide  = s => { const e = typeof s === 'string' ? $(s) : s; if (e) e.style.display = 'none'; };

/* ── Toast ──────────────────────────────────────────────── */
function toast(msg, type = 'success', ms = 3500) {
  const icons = { success:'ti-circle-check', error:'ti-circle-x', warn:'ti-alert-triangle', info:'ti-info-circle' };
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  d.innerHTML = `<i class="ti ${icons[type]||icons.info}"></i><span>${msg}</span>`;
  $('#toast-container').appendChild(d);
  setTimeout(() => d.remove(), ms);
}

/* ── Modal ──────────────────────────────────────────────── */
function openModal(title, html, wide = false) {
  setText('#modal-title', title);
  setHTML('#modal-body', html);
  const box = $('#modal-box');
  box.className = wide ? 'modal-box wide' : 'modal-box';
  $('#modal-overlay').style.display = 'flex';
  setTimeout(() => { const inp = $('#modal-body input,#modal-body select,#modal-body textarea'); if (inp) inp.focus(); }, 80);
}
function closeModal(e) {
  if (e && e.target !== $('#modal-overlay')) return;
  $('#modal-overlay').style.display = 'none';
  setHTML('#modal-body', '');
}
function forceCloseModal() {
  $('#modal-overlay').style.display = 'none';
  setHTML('#modal-body', '');
}

/* ── Confirm ────────────────────────────────────────────── */
function confirm(msg, cb) {
  openModal('Confirm', `
    <div class="form-section">
      <p style="color:var(--txt2);line-height:1.6">${msg}</p>
      <div class="form-actions">
        <button class="sec-btn" onclick="forceCloseModal()">Cancel</button>
        <button class="danger-btn" id="confirm-ok"><i class="ti ti-check"></i> Confirm</button>
      </div>
    </div>`);
  setTimeout(() => { const b = $('#confirm-ok'); if (b) b.onclick = () => { forceCloseModal(); cb(); }; }, 60);
}

/* ── Helpers ────────────────────────────────────────────── */
const initials = n => { if (!n) return '?'; const p = n.trim().split(' '); return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase(); };
const debounce = (fn, ms=300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const loading = (msg='Loading...') => `<div class="loading-state"><div class="loading-spinner"></div><span>${msg}</span></div>`;
const empty   = (msg, icon='ti-inbox') => `<div class="empty-state"><i class="ti ${icon}"></i><p>${msg}</p></div>`;
const tdMono  = v => `<td class="mono">${esc(v)||'—'}</td>`;
const tdDate  = v => `<td style="font-size:11px;color:var(--txt2)">${fmtDate(v)}</td>`;
const tdAmt   = v => `<td class="text-teal">${fmtM(v)}</td>`;
const tdPill  = s => `<td>${pill(s)}</td>`;
