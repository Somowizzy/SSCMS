window.LoginComponent = {
  init() {
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    // Create particles background
    this.createParticles();

    form.onsubmit = async (e) => {
      e.preventDefault();
      
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        this.showError(errorDiv, 'Please enter both email and password');
        return;
      }

      // UI Loading state
      errorDiv.style.display = 'none';
      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoader.style.display = 'inline-block';

      try {
        const result = await window.api.login(email, password);
        
        // Success
        form.reset();
        window.location.hash = '#dashboard';
        window.location.reload(); // Reload to trigger app init with new state
        
      } catch (err) {
        this.showError(errorDiv, err.message || 'Login failed. Please try again.');
        submitBtn.disabled = false;
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
      }
    };
  },

  showError(el, message) {
    el.textContent = message;
    el.style.display = 'block';
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'fadeIn 0.3s forwards';
  },

  createParticles() {
    const container = document.getElementById('login-particles');
    if (!container) return;
    
    container.innerHTML = '';
    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      
      // Random properties
      const size = Math.random() * 20 + 5;
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      const duration = Math.random() * 20 + 10;
      const delay = Math.random() * 5;
      
      particle.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 50%;
        left: ${left}%;
        top: ${top}%;
        animation: float ${duration}s ease-in-out ${delay}s infinite alternate;
      `;
      
      container.appendChild(particle);
    }
    
    // Add animation styles if not present
    if (!document.getElementById('particle-style')) {
      const style = document.createElement('style');
      style.id = 'particle-style';
      style.textContent = `
        @keyframes float {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) rotate(360deg); }
        }
        .forgot-password-link {
          color: rgba(255,255,255,0.6);
          text-decoration: none;
          font-size: 0.875rem;
          transition: color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }
        .forgot-password-link:hover {
          color: rgba(255,255,255,0.95);
          text-decoration: underline;
        }
        /* Reset password overlay */
        #reset-pwd-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        #reset-pwd-overlay.open {
          display: flex;
        }
        #reset-pwd-card {
          background: #1e1e2e;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 2.5rem;
          max-width: 420px;
          width: 90%;
          color: #fff;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          animation: fadeIn 0.25s ease;
        }
        #reset-pwd-card h3 { margin-bottom: 0.5rem; font-size: 1.3rem; }
        #reset-pwd-card p  { color: rgba(255,255,255,0.55); font-size: 0.875rem; margin-bottom: 1.5rem; }
        #reset-pwd-card input {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          color: #fff;
          font-size: 0.95rem;
          box-sizing: border-box;
          margin-bottom: 1rem;
        }
        #reset-pwd-card input:focus { outline: none; border-color: #7c3aed; }
        #reset-pwd-card .btn-row { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem; }
        #reset-pwd-card .btn-cancel {
          padding: 0.6rem 1.25rem;
          background: rgba(255,255,255,0.1);
          border: none;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          font-size: 0.9rem;
        }
        #reset-pwd-card .btn-send {
          padding: 0.6rem 1.25rem;
          background: linear-gradient(135deg, #7c3aed, #2563eb);
          border: none;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
        }
        #reset-pwd-card .btn-send:disabled { opacity: 0.6; cursor: default; }
        #reset-msg { font-size: 0.85rem; margin-top: 0.5rem; min-height: 1.2em; }
        #reset-msg.success { color: #4ade80; }
        #reset-msg.error   { color: #f87171; }
      `;
      document.head.appendChild(style);
    }

    // Inject reset password overlay into body (if not already)
    if (!document.getElementById('reset-pwd-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'reset-pwd-overlay';
      overlay.innerHTML = `
        <div id="reset-pwd-card">
          <h3><i class="fas fa-key" style="margin-right:0.5rem;"></i>Password Reset</h3>
          <p>Enter your registered email address. Your account will be flagged for password reset and HR Admin will be notified.</p>
          <input type="email" id="reset-email-input" placeholder="your.email@sscms.com" autocomplete="email" />
          <div id="reset-msg"></div>
          <div class="btn-row">
            <button class="btn-cancel" onclick="window.closeResetPasswordModal()">Cancel</button>
            <button class="btn-send" id="btn-send-reset" onclick="window.submitPasswordReset()">
              <i class="fas fa-paper-plane"></i> Send Reset Request
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Close on backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) window.closeResetPasswordModal();
      });
    }
  }
};

// Show/hide reset password modal
window.showResetPasswordModal = function(e) {
  if (e) e.preventDefault();
  const overlay = document.getElementById('reset-pwd-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  const inp = document.getElementById('reset-email-input');
  if (inp) { inp.value = ''; inp.focus(); }
  const msg = document.getElementById('reset-msg');
  if (msg) { msg.textContent = ''; msg.className = 'reset-msg'; }
  const btn = document.getElementById('btn-send-reset');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Request'; }
};

window.closeResetPasswordModal = function() {
  const overlay = document.getElementById('reset-pwd-overlay');
  if (overlay) overlay.classList.remove('open');
};

window.submitPasswordReset = async function() {
  const emailInput = document.getElementById('reset-email-input');
  const msg = document.getElementById('reset-msg');
  const btn = document.getElementById('btn-send-reset');

  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) {
    msg.textContent = 'Please enter your email address.';
    msg.className = 'error';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  msg.textContent = '';
  msg.className = '';

  try {
    await window.api.post('/auth/reset-request', { email });
    msg.textContent = '✓ Reset request submitted. HR Admin has been notified and will contact you with your new password.';
    msg.className = 'success';
    btn.innerHTML = '<i class="fas fa-check"></i> Submitted';
  } catch (err) {
    msg.textContent = err.message || 'Failed to submit reset request. Please contact HR Admin directly.';
    msg.className = 'error';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Request';
  }
};

// Global toggle password visibility
window.togglePassword = function() {
  const input = document.getElementById('login-password');
  const icon = document.querySelector('.toggle-password i');
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
};
