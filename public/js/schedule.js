/* ══════════════════════════════════════════════════════════════
   schedule.js — Production schedule (Gantt week view)
   ══════════════════════════════════════════════════════════════
   Renders a 7-day Gantt of production jobs across the 9 machines.
   Wired to /api/production data. Bars are positioned by start day
   and sized by quantity vs. a daily throughput baseline.
*/

let _schWeekStart = null; // Monday of the displayed week, set on first render

const _SCH_MACHINE_GROUPS = [
  { label: 'Preform machines', machines: ['Husky P1', 'Husky P2', 'Husky P3', 'Husky P4', 'Husky P5', 'Husky P6'] },
  { label: 'Cap machines',     machines: ['SACMI S1', 'SACMI S2'] },
  { label: 'Universal / Spare', machines: ['IPS'] },
];

const _SCH_PRODUCT_COLORS = [
  { match: /28mm.*preform|preform.*28mm/i, label: '28mm Preform', cls: 'bl', bg: 'rgba(59,130,246,.75)' },
  { match: /30mm.*preform|preform.*30mm/i, label: '30mm Preform', cls: 'tl', bg: 'rgba(20,184,166,.7)' },
  { match: /32mm.*preform|preform.*32mm/i, label: '32mm Preform', cls: 'pu', bg: 'rgba(167,139,250,.65)' },
  { match: /38mm.*preform|preform.*38mm/i, label: '38mm Preform', cls: 'in', bg: 'rgba(99,102,241,.65)' },
  { match: /25mm.*preform|preform.*25mm/i, label: '25mm Preform', cls: 'cy', bg: 'rgba(6,182,212,.65)' },
  { match: /29mm.*preform|preform.*29mm/i, label: '29mm Preform', cls: 'em', bg: 'rgba(16,185,129,.6)' },
  { match: /29mm.*cap|cap.*29mm/i,         label: '29mm Cap',     cls: 'gn', bg: 'rgba(34,197,94,.65)' },
  { match: /28mm.*cap|cap.*28mm/i,         label: '28mm Cap',     cls: 'em', bg: 'rgba(16,185,129,.6)' },
  { match: /38mm.*cap|cap.*38mm/i,         label: '38mm Cap',     cls: 'am', bg: 'rgba(245,158,11,.65)' },
];

// Customer-named preforms → the underlying 28mm/29mm/30mm spec they belong
// to, so the Gantt bar paints the right colour even when the catalog name
// doesn't include the neck size literally (e.g. "Maltina Preform (Amber)").
const _SCH_PRODUCT_ALIAS = [
  { match: /maltina|amstel\s*malta|fayrouz|coke|fanta|sprite|schweppes|predator|bigi\s*cola|bigi.*apple|bigi.*orange|bigi.*tropical|fearless/i, color: '28mm Preform' },
  { match: /pure\s*life/i,                            color: '30mm Preform' },
  { match: /eva\s*water|bigi\s*premium.*water/i,      color: '29mm Preform' },
];

function _schProductColor(name) {
  for (const p of _SCH_PRODUCT_COLORS) if (p.match.test(name || '')) return p;
  for (const a of _SCH_PRODUCT_ALIAS) {
    if (a.match.test(name || '')) {
      const found = _SCH_PRODUCT_COLORS.find(p => p.label === a.color);
      if (found) return found;
    }
  }
  return { label: 'Other', cls: 'gr', bg: 'rgba(122,133,153,.45)' };
}

function _schStartOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // make Monday=0
  x.setDate(x.getDate() - day);
  return x;
}

function _schISOWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yStart) / 86400000) + 1) / 7);
}

async function renderSchedule() {
  setHTML('#page-content', loading());
  try {
    const res = await API.production.list();
    const jobs = Array.isArray(res) ? res : (res.jobs || res.items || res.data || []);
    if (!_schWeekStart) _schWeekStart = _schStartOfWeek(new Date());
    _schBuildPage(jobs);
  } catch (err) {
    setHTML('#page-content', `<div class="empty-state"><i class="ti ti-alert-circle text-red"></i><p>${esc(err.message)}</p></div>`);
  }
}

function schShiftWeek(delta) {
  _schWeekStart = new Date(_schWeekStart);
  _schWeekStart.setDate(_schWeekStart.getDate() + delta * 7);
  renderSchedule();
}

function schThisWeek() {
  _schWeekStart = _schStartOfWeek(new Date());
  renderSchedule();
}

function _schBuildPage(jobs) {
  const start = new Date(_schWeekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const endExclusive = new Date(start); endExclusive.setDate(endExclusive.getDate() + 7);
  const todayIdx = days.findIndex(d => d.toDateString() === new Date().toDateString());

  // KPIs (this week)
  const weekJobs = jobs.filter(j => {
    const t = new Date(j.scheduled_date || j.created_at || 0).getTime();
    return t >= start.getTime() && t < endExclusive.getTime();
  });
  const runsThisWeek    = weekJobs.length;
  const machinesActive  = new Set(weekJobs.filter(j => (j.status || '').toLowerCase() !== 'cancelled').map(j => j.machine).filter(Boolean)).size;
  const cancelled       = weekJobs.filter(j => (j.status || '').toLowerCase() === 'cancelled').length;
  // Planned downtime = quantity not yet produced across active runs / 50000 (rough hours estimate)
  const remainingUnits  = weekJobs.reduce((s, j) => s + Math.max(0, Number(j.quantity_requested || 0) - Number(j.quantity_completed || 0)), 0);
  const plannedDowntime = (remainingUnits / 50000).toFixed(1);

  const weekLabel = `Week ${_schISOWeek(start)} — ${start.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  setHTML('#page-content', `
    <!-- Week nav -->
    <div class="week-nav" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button class="icon-btn" onclick="schShiftWeek(-1)" title="Previous week"><i class="ti ti-chevron-left"></i></button>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:700;color:var(--txt)">${esc(weekLabel)}</div>
      <button class="icon-btn" onclick="schShiftWeek(1)" title="Next week"><i class="ti ti-chevron-right"></i></button>
      <button class="sec-btn" onclick="schThisWeek()"><i class="ti ti-calendar"></i> This week</button>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico b"><i class="ti ti-calendar-check"></i></div></div><div class="kpi-val">${fmt(runsThisWeek)}</div><div class="kpi-lbl">Runs this week</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico g"><i class="ti ti-circle-check"></i></div></div><div class="kpi-val">${fmt(machinesActive)}</div><div class="kpi-lbl">Machines active</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico a"><i class="ti ti-tool"></i></div></div><div class="kpi-val text-amber">${fmt(cancelled)}</div><div class="kpi-lbl">Cancelled / maintenance</div></div>
      <div class="kpi"><div class="kpi-top"><div class="kpi-ico r"><i class="ti ti-clock-off"></i></div></div><div class="kpi-val">${plannedDowntime}h</div><div class="kpi-lbl">Planned remaining (est)</div></div>
    </div>

    <!-- Legend -->
    <div class="sched-legend" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--txt2);font-weight:600">Legend:</span>
      ${_SCH_PRODUCT_COLORS.slice(0, 6).map(p => `
        <div class="leg" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--txt2)">
          <div class="leg-bar" style="width:18px;height:10px;border-radius:3px;background:${p.bg}"></div>${esc(p.label)}
        </div>`).join('')}
      <div class="leg" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--txt2)">
        <div class="leg-bar" style="width:18px;height:10px;border-radius:3px;background:repeating-linear-gradient(45deg,rgba(239,68,68,.3),rgba(239,68,68,.3) 3px,transparent 3px,transparent 6px);border:1px dashed rgba(239,68,68,.4)"></div>Cancelled / down
      </div>
    </div>

    <!-- Gantt -->
    <div class="card">
      <div class="gantt-header">
        <div class="gantt-label-col">Machine</div>
        <div class="gantt-days">
          ${days.map((d, i) => `
            <div class="gantt-day ${i === todayIdx ? 'today' : ''}">
              <div class="gantt-day-name">${d.toLocaleDateString('en-NG', { weekday: 'short' })}</div>
              <div class="gantt-day-num">${d.getDate()}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ${_SCH_MACHINE_GROUPS.map(group => `
        <div class="gantt-section-hd">${esc(group.label)}</div>
        ${group.machines.map(m => _schGanttRow(m, jobs, start, todayIdx)).join('')}
      `).join('')}
    </div>
  `);
}

function _schGanttRow(machine, jobs, weekStart, todayIdx) {
  const startMs = weekStart.getTime();
  const endMs = startMs + 7 * 86400000;
  const dayMs = 86400000;

  // Find jobs assigned to this machine that touch the week.
  // Estimate run span: each ~10k units consumes one day; minimum 1 day.
  const rows = jobs
    .filter(j => j.machine === machine && (j.status || '').toLowerCase() !== 'cancelled')
    .map(j => {
      const startD = new Date(j.scheduled_date || j.created_at || Date.now());
      startD.setHours(0, 0, 0, 0);
      const totalUnits = Math.max(Number(j.quantity_requested || j.quantity_completed || 1000), 1000);
      const spanDays = Math.max(1, Math.min(7, Math.ceil(totalUnits / 10000)));
      const endD = new Date(startD);
      endD.setDate(endD.getDate() + spanDays);
      // Intersection with the displayed week
      const visStart = Math.max(startD.getTime(), startMs);
      const visEnd   = Math.min(endD.getTime(),   endMs);
      if (visEnd <= visStart) return null;
      const leftPct  = ((visStart - startMs) / (endMs - startMs)) * 100;
      const widthPct = ((visEnd   - visStart) / (endMs - startMs)) * 100;
      return { job: j, leftPct, widthPct };
    })
    .filter(Boolean);

  // Top-of-row label uses the most recent job's product, or the machine's
  // default (Preform / Cap) so the row always has context.
  const recent = rows[rows.length - 1]?.job;
  const productLabel = recent?.product_name || _schMachineDefaultProduct(machine);

  return `<div class="gantt-row">
    <div class="gantt-row-label">
      <div class="g-machine">${esc(machine)}</div>
      <div class="g-product">${esc(productLabel)}</div>
    </div>
    <div class="gantt-cells">
      ${Array.from({ length: 7 }, (_, i) => `<div class="gantt-cell ${i === todayIdx ? 'today-col' : ''}"></div>`).join('')}
      ${rows.map(r => {
        const color = _schProductColor(r.job.product_name);
        const pct   = Number(r.job.quantity_requested || 0) > 0
          ? Math.round((Number(r.job.quantity_completed || 0) / Number(r.job.quantity_requested)) * 100)
          : 0;
        const label = `#${r.job.id} &middot; ${fmt(r.job.quantity_requested || 0)} ${pct ? '(' + pct + '%)' : ''}`;
        return `<div class="g-bar" style="position:absolute;top:10px;height:30px;border-radius:6px;display:flex;align-items:center;padding:0 8px;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;color:#fff;cursor:pointer;background:${color.bg};border:1px solid ${color.bg}" onclick="goTo('production')" title="${esc(r.job.product_name || '')}">${label}</div>`.replace('position:absolute;', `position:absolute;left:${r.leftPct}%;width:${r.widthPct}%;`);
      }).join('')}
    </div>
  </div>`;
}

function _schMachineDefaultProduct(machine) {
  const m = (typeof PROD_MACHINE_META !== 'undefined' && PROD_MACHINE_META[machine]) ? PROD_MACHINE_META[machine] : null;
  return m ? m.type : '—';
}
