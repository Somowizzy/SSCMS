window.SidebarComponent = {
  render(container, role) {
    let html = '';

    // Dashboard available to all
    html += this.createNavItem('dashboard', 'fas fa-chart-line', 'Dashboard');

    // Role-based rendering
    if (role === 'hr_admin' || role === 'system_admin') {
      // Admins see everything
      html += this.createNavItem('inventory', 'fas fa-boxes', 'Inventory');
      html += this.createNavItem('production', 'fas fa-industry', 'Production');
      html += this.createNavItem('finished-goods', 'fas fa-box-check', 'Finished Goods');
      html += this.createNavItem('shipping', 'fas fa-truck', 'Shipping');
      html += this.createNavItem('requests', 'fas fa-clipboard-list', 'Requests');
      html += this.createNavItem('users', 'fas fa-users', 'User Management');
    } else {
      // Department specific views
      const user = window.api.getCurrentUser();
      
      if (user.departmentId === 1) { // Raw Materials
        html += this.createNavItem('inventory', 'fas fa-boxes', 'Raw Materials');
        html += this.createNavItem('requests', 'fas fa-clipboard-list', 'Requisitions');
      } 
      else if (user.departmentId === 2) { // Production
        html += this.createNavItem('production', 'fas fa-industry', 'Production Jobs');
        html += this.createNavItem('requests', 'fas fa-clipboard-list', 'Material Requests');
      }
      else if (user.departmentId === 3) { // Finished Goods
        html += this.createNavItem('finished-goods', 'fas fa-box-check', 'Finished Goods');
        html += this.createNavItem('requests', 'fas fa-clipboard-list', 'Transfer Requests');
      }
      else if (user.departmentId === 4) { // Shipping
        html += this.createNavItem('shipping', 'fas fa-truck', 'Shipments');
        html += this.createNavItem('requests', 'fas fa-clipboard-list', 'Shipping Requests');
      }
    }

    container.innerHTML = html;
  },

  createNavItem(route, iconClass, label) {
    const currentHash = window.location.hash || '#dashboard';
    const isActive = currentHash.includes(route) ? 'active' : '';
    
    return `
      <a href="#${route}" class="nav-item ${isActive}">
        <i class="${iconClass}"></i>
        <span>${label}</span>
      </a>
    `;
  }
};
