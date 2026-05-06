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
      `;
      document.head.appendChild(style);
    }
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
