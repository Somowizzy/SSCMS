// Main Application Logic for SSCMS

// DOM Elements
const elements = {
  app: document.getElementById('app'),
  loginScreen: document.getElementById('login-screen'),
  mainApp: document.getElementById('main-app'),
  pageContent: document.getElementById('page-content'),
  sidebar: document.getElementById('sidebar'),
  breadcrumb: document.getElementById('breadcrumb'),
  userInitials: document.getElementById('avatar-initials'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalContent: document.getElementById('modal-content'),
  toastContainer: document.getElementById('toast-container'),
  notificationBell: document.getElementById('notification-bell'),
  notificationBadge: document.getElementById('notification-badge'),
  notificationPanel: document.getElementById('notification-panel'),
  notificationList: document.getElementById('notification-list')
};

// Application State
const state = {
  currentUser: null,
  currentRoute: 'dashboard',
  notifications: []
};

// Helper: Show Toast Notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'check-circle';
  if (type === 'error') icon = 'exclamation-circle';
  if (type === 'warning') icon = 'exclamation-triangle';
  
  toast.innerHTML = `
    <i class="fas fa-${icon}"></i>
    <div class="toast-content">${message}</div>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// Helper: Modal Management
function openModal(html) {
  elements.modalContent.innerHTML = html;
  elements.modalOverlay.style.display = 'flex';
}

function closeModal() {
  elements.modalOverlay.style.display = 'none';
  elements.modalContent.innerHTML = '';
}

// Global scope helpers
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;

// Helper: Format Date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Helper: Format Currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

// Global Scope Exports
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.formatCurrency = formatCurrency;

// Layout Helpers
function toggleSidebar() {
  elements.sidebar.classList.toggle('open');
}
window.toggleSidebar = toggleSidebar;

function toggleNotifications() {
  const isVisible = elements.notificationPanel.style.display === 'flex';
  elements.notificationPanel.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible && state.notifications.some(n => !n.read)) {
    markAllRead();
  }
}
window.toggleNotifications = toggleNotifications;

// Close notifications when clicking outside
document.addEventListener('click', (e) => {
  if (elements.notificationPanel && 
      elements.notificationPanel.style.display === 'flex' && 
      !elements.notificationBell.contains(e.target) && 
      !elements.notificationPanel.contains(e.target)) {
    elements.notificationPanel.style.display = 'none';
  }
});

// Load Notifications
async function loadNotifications() {
  if (!state.currentUser) return;
  try {
    const data = await window.api.get('/notifications');
    state.notifications = data.notifications;
    updateNotificationUI();
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function updateNotificationUI() {
  const unread = state.notifications.filter(n => !n.is_read);
  
  if (unread.length > 0) {
    elements.notificationBadge.textContent = unread.length;
    elements.notificationBadge.style.display = 'flex';
  } else {
    elements.notificationBadge.style.display = 'none';
  }
  
  if (state.notifications.length === 0) {
    elements.notificationList.innerHTML = '<div class="p-3 text-center text-muted">No notifications</div>';
    return;
  }
  
  elements.notificationList.innerHTML = state.notifications.map(n => `
    <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.link}')">
      <div class="notification-title">${n.title}</div>
      <div class="notification-message">${n.message}</div>
      <div class="notification-time">${formatDateTime(n.created_at)}</div>
    </div>
  `).join('');
}

async function markAllRead() {
  try {
    await window.api.patch('/notifications/read-all');
    state.notifications.forEach(n => n.is_read = 1);
    updateNotificationUI();
  } catch (err) {
    console.error('Failed to mark notifications read:', err);
  }
}
window.markAllRead = markAllRead;

async function handleNotificationClick(id, link) {
  try {
    await window.api.patch(`/notifications/${id}/read`);
    const notif = state.notifications.find(n => n.id == id);
    if (notif) notif.is_read = 1;
    updateNotificationUI();
    
    // Navigate to link
    if (link) {
      const hash = link.startsWith('/') ? link.substring(1) : link;
      window.location.hash = `#${hash}`;
      elements.notificationPanel.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to mark notification read:', err);
  }
}
window.handleNotificationClick = handleNotificationClick;

// Routing logic
function handleRoute() {
  if (!state.currentUser) {
    showLogin();
    return;
  }

  showMainApp();
  
  const hash = window.location.hash.substring(1) || 'dashboard';
  const parts = hash.split('/');
  const route = parts[0];
  const params = parts.slice(1);
  
  state.currentRoute = route;
  updateBreadcrumb(route);
  
  // Highlight active sidebar item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    if (el.getAttribute('href') === `#${route}`) {
      el.classList.add('active');
    }
  });

  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 768) {
    elements.sidebar.classList.remove('open');
  }

  // Render appropriate component
  elements.pageContent.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';

  try {
    switch (route) {
      case 'dashboard':
        if (window.DashboardComponent) window.DashboardComponent.render(elements.pageContent);
        break;
      case 'inventory':
        if (window.InventoryComponent) window.InventoryComponent.render(elements.pageContent);
        break;
      case 'production':
        if (window.ProductionComponent) window.ProductionComponent.render(elements.pageContent);
        break;
      case 'finished-goods':
        if (window.FinishedGoodsComponent) window.FinishedGoodsComponent.render(elements.pageContent);
        break;
      case 'shipping':
        if (window.ShippingComponent) window.ShippingComponent.render(elements.pageContent);
        break;
      case 'requests':
        if (window.RequestsComponent) window.RequestsComponent.render(elements.pageContent);
        break;
      case 'users':
        if (window.UsersComponent) window.UsersComponent.render(elements.pageContent);
        break;
      default:
        elements.pageContent.innerHTML = `
          <div class="content-card text-center" style="padding: 3rem;">
            <i class="fas fa-hammer text-muted" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <h2>Page Under Construction</h2>
            <p class="text-muted">The module "${route}" is currently being developed.</p>
          </div>
        `;
    }
  } catch (e) {
    console.error(`Error rendering route ${route}:`, e);
    elements.pageContent.innerHTML = `
      <div class="login-error">
        Failed to load page content. Please try refreshing.
      </div>
    `;
  }
}

function updateBreadcrumb(route) {
  const formattedRoute = route.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  elements.breadcrumb.innerHTML = `Home / <span>${formattedRoute}</span>`;
}

// Authentication Flow
function showLogin() {
  elements.mainApp.style.display = 'none';
  elements.loginScreen.style.display = 'flex';
  if (window.LoginComponent) {
    window.LoginComponent.init();
  }
}

function showMainApp() {
  elements.loginScreen.style.display = 'none';
  elements.mainApp.style.display = 'flex';
  
  // Setup user info
  if (state.currentUser) {
    const { firstName, lastName, role } = state.currentUser;
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    
    elements.userInitials.textContent = initials;
    
    const userInfoEl = document.getElementById('sidebar-user-info');
    if (userInfoEl) {
      userInfoEl.innerHTML = `
        <div class="avatar-circle">${initials}</div>
        <div class="user-details">
          <div class="user-name">${firstName} ${lastName}</div>
          <div class="user-role">${role.replace('_', ' ')}</div>
        </div>
      `;
    }

    // Initialize sidebar
    if (window.SidebarComponent) {
      window.SidebarComponent.render(document.getElementById('sidebar-nav'), role);
    }

    // Load initial notifications
    loadNotifications();
    
    // Poll for notifications every minute
    setInterval(loadNotifications, 60000);
  }
}

async function handleLogout() {
  try {
    await window.api.logout();
    state.currentUser = null;
    window.location.hash = '';
    showLogin();
  } catch (err) {
    console.error('Logout error:', err);
    showToast('Failed to logout cleanly', 'error');
  }
}
window.handleLogout = handleLogout;

// App Initialization
async function initApp() {
  console.log('Initializing SSCMS...');
  
  // Check auth state
  state.currentUser = window.api.getCurrentUser();
  
  if (state.currentUser) {
    // Validate token by fetching user
    try {
      const data = await window.api.get('/auth/me');
      state.currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (e) {
      state.currentUser = null;
      window.api.setToken(null);
    }
  }

  // Setup routing
  window.addEventListener('hashchange', handleRoute);
  
  // Initial route
  handleRoute();
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
