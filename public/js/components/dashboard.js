window.DashboardComponent = {
  async render(container) {
    try {
      const data = await window.api.get('/reports/dashboard');
      
      const userRole = window.api.getCurrentUser().role;
      const isAdmin = userRole === 'hr_admin' || userRole === 'system_admin';

      let html = `
        <div class="page-header">
          <div class="page-title">
            <h1>Dashboard Overview</h1>
            <p>Welcome back! Here's what's happening today.</p>
          </div>
          ${isAdmin ? `
            <div class="header-actions">
              <button class="btn btn-secondary" onclick="window.DashboardComponent.exportReport('inventory')">
                <i class="fas fa-download"></i> Export Inventory Report
              </button>
            </div>
          ` : ''}
        </div>
      `;

      // Top Stats Grid
      html += `<div class="dashboard-grid">`;
      
      // Inventory Stat
      html += `
        <div class="content-card stat-card">
          <div class="stat-icon" style="background: rgba(67, 97, 238, 0.1); color: var(--primary-light);">
            <i class="fas fa-boxes"></i>
          </div>
          <div class="stat-info">
            <h3>Total Inventory Value</h3>
            <div class="stat-value">${window.formatCurrency(data.inventory.totalValue)}</div>
            <div class="mt-1" style="font-size: 0.8rem; color: var(--warning-color);">
              <i class="fas fa-exclamation-triangle"></i> ${data.inventory.lowStock} Low Stock Items
            </div>
          </div>
        </div>
      `;

      // Production Stat
      html += `
        <div class="content-card stat-card">
          <div class="stat-icon" style="background: rgba(46, 204, 113, 0.1); color: var(--success-color);">
            <i class="fas fa-industry"></i>
          </div>
          <div class="stat-info">
            <h3>Active Production Jobs</h3>
            <div class="stat-value">${data.production.inProgress}</div>
            <div class="mt-1 text-muted" style="font-size: 0.8rem;">
              ${data.production.completed} Completed Today
            </div>
          </div>
        </div>
      `;

      // Pending Requests Stat
      html += `
        <div class="content-card stat-card">
          <div class="stat-icon" style="background: rgba(243, 156, 18, 0.1); color: var(--warning-color);">
            <i class="fas fa-clipboard-list"></i>
          </div>
          <div class="stat-info">
            <h3>Pending Requests</h3>
            <div class="stat-value">${data.requests.pending}</div>
            <div class="mt-1 text-muted" style="font-size: 0.8rem;">
              Out of ${data.requests.total} Total
            </div>
          </div>
        </div>
      `;

      // Shipping Stat
      html += `
        <div class="content-card stat-card">
          <div class="stat-icon" style="background: rgba(155, 89, 182, 0.1); color: #9b59b6;">
            <i class="fas fa-truck"></i>
          </div>
          <div class="stat-info">
            <h3>In Transit Shipments</h3>
            <div class="stat-value">${data.shipping.inTransit}</div>
            <div class="mt-1 text-muted" style="font-size: 0.8rem;">
              ${data.finishedGoods.readyToShip} Items Ready to Ship
            </div>
          </div>
        </div>
      `;
      
      html += `</div>`; // End Grid

      // Main Content Area
      html += `<div class="grid-2">`;

      // Left Column: AI Insights
      html += `
        <div class="dashboard-col">
          <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">AI Insights & Forecasts</h2>
          
          <div class="content-card mb-3 insight-card">
            <div class="insight-header">
              <i class="fas fa-chart-line"></i> Demand Forecast (Next 7 Days)
            </div>
            <div class="table-container" style="margin-bottom: 0;">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Est. Demand</th>
                    <th>Trend</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.aiInsights.forecast.slice(0, 4).map(f => {
                    const confidence = f.riskLevel === 'low' ? 92 : f.riskLevel === 'medium' ? 78 : f.riskLevel === 'high' ? 65 : 50;
                    return `
                    <tr>
                      <td>${f.productName}</td>
                      <td><strong>${f.forecast7Day}</strong> ${f.unit || 'units'}</td>
                      <td>
                        ${f.trendDirection === 'increasing' ? '<span class="text-danger"><i class="fas fa-arrow-up"></i> Rising</span>' : 
                          f.trendDirection === 'decreasing' ? '<span class="text-success"><i class="fas fa-arrow-down"></i> Falling</span>' : 
                          '<span class="text-muted"><i class="fas fa-minus"></i> Stable</span>'}
                      </td>
                      <td><div class="badge badge-info">${confidence}%</div></td>
                    </tr>
                  `}).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="content-card insight-card" style="border-left-color: var(--warning-color); background: linear-gradient(to right, rgba(243, 156, 18, 0.1), transparent);">
            <div class="insight-header" style="color: var(--warning-color);">
              <i class="fas fa-exclamation-circle"></i> Smart Reorder Suggestions
            </div>
            ${data.aiInsights.reorderSuggestions.length > 0 ? `
              <div class="table-container" style="margin-bottom: 0;">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Current</th>
                      <th>Suggested Order</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.aiInsights.reorderSuggestions.slice(0, 3).map(r => `
                      <tr>
                        <td>${r.productName}</td>
                        <td>${r.currentStock} ${r.unit || ''}</td>
                        <td><strong>${r.suggestedQty}</strong></td>
                        <td>
                          <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                                  onclick="window.location.hash='#requests'">
                            Create Request
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p class="text-muted text-center" style="padding: 1rem;">Inventory levels are optimal. No reorders needed right now.</p>'}
          </div>
        </div>
      `;

      // Right Column: Recent Activity
      html += `
        <div class="dashboard-col">
          <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">Recent System Activity</h2>
          <div class="content-card" style="height: calc(100% - 2.5rem); overflow-y: auto;">
            ${data.recentActivity.length > 0 ? `
              <div class="activity-timeline">
                ${data.recentActivity.map(activity => `
                  <div class="activity-item" style="padding: 1rem; border-bottom: 1px solid var(--dark-border); display: flex; gap: 1rem;">
                    <div style="color: var(--primary-light); margin-top: 2px;">
                      <i class="fas fa-circle" style="font-size: 0.5rem;"></i>
                    </div>
                    <div>
                      <div style="font-size: 0.9rem; font-weight: 500;">${activity.action}</div>
                      <div style="font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0;">${activity.detail}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">
                        <i class="fas fa-user mr-1"></i> ${activity.user_name} &bull; ${window.formatDateTime(activity.created_at)}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center">No recent activity found.</p>'}
          </div>
        </div>
      `;

      html += `</div>`; // End Grid-2

      container.innerHTML = html;

    } catch (err) {
      container.innerHTML = `
        <div class="content-card text-center text-danger" style="padding: 3rem;">
          <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
          <h3>Failed to load dashboard data</h3>
          <p>${err.message}</p>
          <button class="btn btn-primary mt-2" onclick="window.DashboardComponent.render(document.getElementById('page-content'))">Try Again</button>
        </div>
      `;
    }
  },

  async exportReport(type) {
    try {
      window.showToast('Generating report...', 'info');
      
      const response = await fetch(`/api/reports/export/${type}`, {
        headers: {
          'Authorization': `Bearer ${window.api.token}`
        }
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      window.showToast('Report downloaded successfully');
    } catch (err) {
      window.showToast('Failed to export report: ' + err.message, 'error');
    }
  }
};
