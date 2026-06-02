/* ══════════════════════════════════════════════════════════════
   settings.js — System Settings page
   ══════════════════════════════════════════════════════════════
   Multi-section preferences page (Company / Notifications / Security
   / AI / Integrations). Persisted to localStorage so values survive
   reloads; when a backend settings endpoint exists it can be swapped
   in via _settingsLoad / _settingsSave.
*/

const _SETTINGS_KEY = 'sscms.settings.v1';

const _SETTINGS_DEFAULTS = {
  company: {
    name: 'Preform & Cap Mfg. Ltd',
    industry: 'Plastics Manufacturing',
    timezone: 'Africa/Lagos (WAT, UTC+1)',
    currency: 'Nigerian Naira (₦)',
  },
  notifications: {
    lowStock: true,
    machineDowntime: true,
    rpet: true,
    aiForecast: true,
    orderDelay: true,
    dailyDigest: false,
  },
  security: {
    twoFactor: false,
    sessionTimeout: '4 hours',
    auditRetention: '12 months',
  },
  ai: {
    enabled: true,
    horizonWeeks: 6,
    autoReorder: false,
  },
  integrations: {
    sapErp: false,
    sageX3: false,
    slack: false,
  },
  theme: localStorage.getItem('sscms-theme') || 'dark',
};

async function _settingsLoadRemote() {
  try {
    const res = await API.settings.get();
    return _settingsDeepMerge(JSON.parse(JSON.stringify(_SETTINGS_DEFAULTS)), res.settings || {});
  } catch (err) {
    // Fall back to localStorage so the page still works offline / when
    // the user lacks permission to read settings.
    return _settingsLoadLocal();
  }
}

function _settingsLoadLocal() {
  try {
    const raw = localStorage.getItem(_SETTINGS_KEY);
    if (!raw) return JSON.parse(JSON.stringify(_SETTINGS_DEFAULTS));
    const parsed = JSON.parse(raw);
    return _settingsDeepMerge(JSON.parse(JSON.stringify(_SETTINGS_DEFAULTS)), parsed);
  } catch {
    return JSON.parse(JSON.stringify(_SETTINGS_DEFAULTS));
  }
}

// Backward-compat: previous name used by other helpers
function _settingsLoad() { return _settingsLoadLocal(); }

function _settingsDeepMerge(base, override) {
  for (const k in override) {
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) {
      base[k] = _settingsDeepMerge(base[k] || {}, override[k]);
    } else base[k] = override[k];
  }
  return base;
}

async function _settingsSaveRemote(partial) {
  // Persist partial diff to the backend; the server deep-merges. Always also
  // cache locally so reloads work even if the server is briefly unavailable.
  try {
    const res = await API.settings.patch(partial);
    _settings = res.settings || _settingsDeepMerge(_settings, partial);
    localStorage.setItem(_SETTINGS_KEY, JSON.stringify(_settings));
    return true;
  } catch (err) {
    // Fall back to local-only persistence
    _settings = _settingsDeepMerge(_settings, partial);
    localStorage.setItem(_SETTINGS_KEY, JSON.stringify(_settings));
    if (toast) toast('Saved locally — backend unreachable', 'warning');
    return false;
  }
}

let _settings = _settingsLoadLocal();
let _settingsSection = 'company';

async function renderSettings() {
  setHTML('#page-content', loading());
  _settings = await _settingsLoadRemote();
  setHTML('#page-content', `
    <div class="settings-shell" style="display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:flex-start">
      <!-- Left nav -->
      <div class="card" id="settings-nav" style="height:fit-content;padding:8px">
        ${[
          ['company',       'Company',        'ti-building-factory'],
          ['notifications', 'Notifications',  'ti-bell'],
          ['security',      'Security',       'ti-shield'],
          ['ai',            'AI settings',    'ti-brain'],
          ['integrations',  'Integrations',   'ti-link'],
        ].map(([k, label, icon]) => `
          <div class="settings-nav-item ${_settingsSection === k ? 'on' : ''}" data-section="${k}" onclick="settingsGo('${k}')" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;font-size:12.5px;cursor:pointer;margin-bottom:2px;transition:all .12s;${_settingsSection === k ? 'background:rgba(59,130,246,.12);color:var(--blue2)' : 'color:var(--txt2)'}">
            <i class="ti ${icon}" style="font-size:15px"></i> ${label}
          </div>
        `).join('')}
      </div>

      <!-- Right panel -->
      <div style="display:flex;flex-direction:column;gap:12px" id="settings-panel">
        ${_settingsCompanyCard()}
        ${_settingsNotificationsCard()}
        ${_settingsSecurityCard()}
        ${_settingsAiCard()}
        ${_settingsIntegrationsCard()}
      </div>
    </div>
  `);
}

function settingsGo(section) {
  _settingsSection = section;
  document.querySelectorAll('.settings-nav-item').forEach(el => {
    const isOn = el.dataset.section === section;
    el.classList.toggle('on', isOn);
    el.style.background = isOn ? 'rgba(59,130,246,.12)' : '';
    el.style.color      = isOn ? 'var(--blue2)' : 'var(--txt2)';
  });
  const anchor = $('#settings-' + section);
  if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Cards ──────────────────────────────────────────────── */

function _settingsCompanyCard() {
  const s = _settings.company;
  return `<div class="card" id="settings-company">
    <div class="card-hd"><div class="card-hd-title">Company information</div></div>
    ${_settingsRow('Company name', 'Displayed across all system pages',
      `<input class="setting-input" id="s-co-name" value="${esc(s.name)}"/>`)}
    ${_settingsRow('Industry', 'Used for AI forecasting calibration',
      `<input class="setting-input" id="s-co-industry" value="${esc(s.industry)}"/>`)}
    ${_settingsRow('Timezone', 'Affects all timestamps and schedules',
      `<select class="setting-select" id="s-co-tz">
        <option ${s.timezone.startsWith('Africa/Lagos') ? 'selected' : ''}>Africa/Lagos (WAT, UTC+1)</option>
        <option ${s.timezone.startsWith('UTC') ? 'selected' : ''}>UTC</option>
        <option ${s.timezone.startsWith('Europe/London') ? 'selected' : ''}>Europe/London</option>
       </select>`)}
    ${_settingsRow('Currency', 'Used for all financial reporting',
      `<select class="setting-select" id="s-co-cur">
        <option ${s.currency.includes('₦') ? 'selected' : ''}>Nigerian Naira (₦)</option>
        <option ${s.currency.includes('$') ? 'selected' : ''}>US Dollar ($)</option>
        <option ${s.currency.includes('€') ? 'selected' : ''}>Euro (€)</option>
       </select>`)}
    ${_settingsFooter('company')}
  </div>`;
}

function _settingsNotificationsCard() {
  const n = _settings.notifications;
  const rows = [
    ['lowStock',         'Low stock alerts',           'Notify when inventory falls below threshold'],
    ['machineDowntime',  'Machine downtime alerts',    'Instant notification on machine faults'],
    ['rpet',             'R-PET recycling events',     'Notify when batches are processed and added to stock'],
    ['aiForecast',       'AI forecast notifications',  'Alerts on predicted demand spikes'],
    ['orderDelay',       'Order delay alerts',         'Notify when ETA is exceeded'],
    ['dailyDigest',      'Daily summary email',        'End-of-day production & inventory digest'],
  ];
  return `<div class="card" id="settings-notifications">
    <div class="card-hd"><div class="card-hd-title">Alerts &amp; notifications</div></div>
    ${rows.map(([k, label, sub]) => _settingsToggleRow(label, sub, n[k], `_settingsToggle('notifications','${k}', this)`)).join('')}
    ${_settingsFooter('notifications')}
  </div>`;
}

function _settingsSecurityCard() {
  const s = _settings.security;
  return `<div class="card" id="settings-security">
    <div class="card-hd"><div class="card-hd-title">Security</div></div>
    ${_settingsToggleRow('Two-factor authentication', 'Require 2FA for all admin accounts', s.twoFactor, `_settingsToggle('security','twoFactor', this)`)}
    ${_settingsRow('Session timeout', 'Auto logout after inactivity',
      `<select class="setting-select" id="s-sec-session">
        <option ${s.sessionTimeout === '30 minutes' ? 'selected' : ''}>30 minutes</option>
        <option ${s.sessionTimeout === '1 hour' ? 'selected' : ''}>1 hour</option>
        <option ${s.sessionTimeout === '4 hours' ? 'selected' : ''}>4 hours</option>
        <option ${s.sessionTimeout === '8 hours' ? 'selected' : ''}>8 hours</option>
       </select>`)}
    ${_settingsRow('Audit log retention', 'How long to keep activity logs',
      `<select class="setting-select" id="s-sec-audit">
        <option ${s.auditRetention === '6 months' ? 'selected' : ''}>6 months</option>
        <option ${s.auditRetention === '12 months' ? 'selected' : ''}>12 months</option>
        <option ${s.auditRetention === '24 months' ? 'selected' : ''}>24 months</option>
        <option ${s.auditRetention === 'Forever' ? 'selected' : ''}>Forever</option>
       </select>`)}
    ${_settingsFooter('security')}
  </div>`;
}

function _settingsAiCard() {
  const a = _settings.ai;
  return `<div class="card" id="settings-ai">
    <div class="card-hd"><div class="card-hd-title">AI settings</div></div>
    ${_settingsToggleRow('Enable AI demand forecast', 'Use ML-driven demand projections in dashboards', a.enabled, `_settingsToggle('ai','enabled', this)`)}
    ${_settingsToggleRow('Auto-reorder suggestions', 'AI generates reorder POs when stock dips', a.autoReorder, `_settingsToggle('ai','autoReorder', this)`)}
    ${_settingsRow('Forecast horizon', 'How far ahead to project demand',
      `<select class="setting-select" id="s-ai-horizon">
        ${[4, 6, 8, 12].map(w => `<option ${a.horizonWeeks === w ? 'selected' : ''}>${w} weeks</option>`).join('')}
       </select>`)}
    ${_settingsFooter('ai')}
  </div>`;
}

function _settingsIntegrationsCard() {
  const i = _settings.integrations;
  return `<div class="card" id="settings-integrations">
    <div class="card-hd"><div class="card-hd-title">Integrations</div></div>
    ${_settingsToggleRow('SAP ERP sync', 'Synchronise inventory and orders with SAP', i.sapErp, `_settingsToggle('integrations','sapErp', this)`)}
    ${_settingsToggleRow('Sage X3', 'Push purchase orders to Sage X3', i.sageX3, `_settingsToggle('integrations','sageX3', this)`)}
    ${_settingsToggleRow('Slack notifications', 'Post critical alerts to a Slack channel', i.slack, `_settingsToggle('integrations','slack', this)`)}
    ${_settingsFooter('integrations')}
  </div>`;
}

/* ── Row helpers ─────────────────────────────────────────── */

function _settingsRow(label, sub, control) {
  return `<div class="setting-row" style="display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid var(--border);gap:18px">
    <div style="min-width:0">
      <div class="setting-lbl" style="font-size:12.5px;font-weight:600;color:var(--txt)">${label}</div>
      <div class="setting-sub" style="font-size:11px;color:var(--txt2);margin-top:2px">${sub}</div>
    </div>
    <div style="flex-shrink:0;min-width:200px;max-width:280px">${control}</div>
  </div>`;
}

function _settingsToggleRow(label, sub, on, onClickJs) {
  return `<div class="setting-row" style="display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid var(--border);gap:18px">
    <div style="min-width:0">
      <div class="setting-lbl" style="font-size:12.5px;font-weight:600;color:var(--txt)">${label}</div>
      <div class="setting-sub" style="font-size:11px;color:var(--txt2);margin-top:2px">${sub}</div>
    </div>
    <div class="toggle ${on ? 'on' : ''}" onclick="${onClickJs}"></div>
  </div>`;
}

function _settingsFooter(section) {
  return `<div style="display:flex;gap:8px;padding:14px 18px;border-top:1px solid var(--border)">
    <button class="primary-btn" onclick="settingsSaveSection('${section}')"><i class="ti ti-check"></i> Save changes</button>
    <button class="sec-btn" onclick="renderSettings()">Reset</button>
  </div>`;
}

/* ── Mutators ───────────────────────────────────────────── */

function _settingsToggle(group, key, el) {
  _settings[group][key] = !_settings[group][key];
  el.classList.toggle('on', _settings[group][key]);
}

async function settingsSaveSection(section) {
  // Sync inputs/selects back into the state before persisting
  if (section === 'company') {
    _settings.company.name     = $('#s-co-name')?.value     ?? _settings.company.name;
    _settings.company.industry = $('#s-co-industry')?.value ?? _settings.company.industry;
    _settings.company.timezone = $('#s-co-tz')?.value       ?? _settings.company.timezone;
    _settings.company.currency = $('#s-co-cur')?.value      ?? _settings.company.currency;
  } else if (section === 'security') {
    _settings.security.sessionTimeout = $('#s-sec-session')?.value ?? _settings.security.sessionTimeout;
    _settings.security.auditRetention = $('#s-sec-audit')?.value   ?? _settings.security.auditRetention;
  } else if (section === 'ai') {
    const h = $('#s-ai-horizon')?.value || '6 weeks';
    _settings.ai.horizonWeeks = parseInt(h, 10) || 6;
  }
  const partial = { [section]: _settings[section] };
  const ok = await _settingsSaveRemote(partial);
  if (ok) toast(`Saved ${section} settings`, 'success');
}

async function settingsSaveAll() {
  // Sync everything from DOM first
  for (const s of ['company', 'security', 'ai']) {
    if (s === 'company') {
      _settings.company.name     = $('#s-co-name')?.value     ?? _settings.company.name;
      _settings.company.industry = $('#s-co-industry')?.value ?? _settings.company.industry;
      _settings.company.timezone = $('#s-co-tz')?.value       ?? _settings.company.timezone;
      _settings.company.currency = $('#s-co-cur')?.value      ?? _settings.company.currency;
    } else if (s === 'security') {
      _settings.security.sessionTimeout = $('#s-sec-session')?.value ?? _settings.security.sessionTimeout;
      _settings.security.auditRetention = $('#s-sec-audit')?.value   ?? _settings.security.auditRetention;
    } else if (s === 'ai') {
      const h = $('#s-ai-horizon')?.value || '6 weeks';
      _settings.ai.horizonWeeks = parseInt(h, 10) || 6;
    }
  }
  const ok = await _settingsSaveRemote(_settings);
  if (ok) toast('All settings saved', 'success');
}
