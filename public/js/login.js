function togglePass() {
  const inp = $('#login-password');
  const ico = $('#eye-ico');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  ico.className = inp.type === 'password' ? 'ti ti-eye' : 'ti ti-eye-off';
}

async function doLogin() {
  const email = $('#login-email')?.value.trim();
  const pass  = $('#login-password')?.value;
  const btn   = $('#login-btn');
  const errEl = $('#login-error');

  if (!email || !pass) { showLoginError('Please enter your email and password.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px"></div><span>Signing in...</span>';
  if (errEl) errEl.style.display = 'none';

  try {
    const res = await API.auth.login(email, pass);
    App.user = res.user || res;
    showApp();
    await refreshBadges();
    goTo('dashboard');
    // Load login stats
    loadLoginStats();
  } catch (err) {
    showLoginError(err.message || 'Invalid credentials. Please try again.');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i><span>Sign in to dashboard</span>';
  }
}

function showLoginError(msg) {
  const el = $('#login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function doLogout() {
  try { await API.auth.logout(); } catch {}
  showLogin();
  // reset form
  const e = $('#login-email'), p = $('#login-password');
  if (e) e.value = ''; if (p) p.value = '';
  const errEl = $('#login-error');
  if (errEl) errEl.style.display = 'none';
}

// Load live stats on login screen
async function loadLoginStats() {}  // called after login, no-op here; stats shown on dashboard

function showResetForm() {
  $('#login-main-form').style.display = 'none';
  $('#reset-section').style.display = 'block';
  const errEl = $('#login-error');
  if (errEl) errEl.style.display = 'none';
}

function hideResetForm() {
  $('#login-main-form').style.display = '';
  $('#reset-section').style.display = 'none';
  const errEl = $('#login-error');
  if (errEl) errEl.style.display = 'none';
}

async function doReset() {
  const email = $('#reset-email')?.value.trim();
  if (!email) { showLoginError('Please enter your email address.'); return; }
  const btn = $('#reset-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px"></div><span>Resetting...</span>';
  try {
    const res = await API.auth.resetPassword(email);
    hideResetForm();
    const el = $('#login-error');
    if (el) {
      el.textContent = res.message || 'Password reset successfully. Your new password is: #1234#';
      el.style.display = 'block';
      el.style.borderColor = 'rgba(20,184,166,.3)';
      el.style.color = 'var(--teal)';
    }
  } catch (err) {
    showLoginError(err.message || 'Failed to reset password.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-key"></i><span>Reset password</span>';
  }
}

// Allow Enter key on login form
document.addEventListener('DOMContentLoaded', () => {
  ['login-email','login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });

  // Load some stats for the login screen background
  (async () => {
    try {
      const summary = await API.reports.summary().catch(() => null);
      if (summary) {
        setText('#ls-units',  fmt(summary.inventoryCount  || summary.inventory_count  || 0));
        setText('#ls-orders', fmt(summary.pendingRequests || summary.pending_requests  || 0));
        setText('#ls-runs',   fmt(summary.activeRuns      || summary.active_runs       || 0));
      }
    } catch {}
  })();
});
