/**
 * SSCMS API Layer
 * Wraps all /api/* backend routes with consistent error handling
 */
const API = (() => {
  async function req(method, path, body) {
    const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    if (res.status === 401) { window.dispatchEvent(new Event('sscms:logout')); throw new Error('Unauthorized'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }
  const get   = (p)      => req('GET',    p);
  const post  = (p, b)   => req('POST',   p, b);
  const put   = (p, b)   => req('PUT',    p, b);
  const patch = (p, b)   => req('PATCH',  p, b);
  const del   = (p)      => req('DELETE', p);

  return {
    auth: {
      login:         (email, password) => post('/api/auth/login',  { email, password }),
      logout:        ()                => post('/api/auth/logout', {}),
      me:            ()                => get('/api/auth/me'),
      resetPassword: (email)           => post('/api/auth/reset-password', { email }),
    },
    users: {
      list:   ()          => get('/api/users'),
      get:    (id)        => get(`/api/users/${id}`),
      create: (d)         => post('/api/users', d),
      update: (id, d)     => patch(`/api/users/${id}`, d),
      delete: (id)        => del(`/api/users/${id}`),
    },
    departments: {
      list:   ()          => get('/api/departments'),
      get:    (id)        => get(`/api/departments/${id}`),
      create: (d)         => post('/api/departments', d),
      update: (id, d)     => patch(`/api/departments/${id}`, d),
      delete: (id)        => del(`/api/departments/${id}`),
    },
    inventory: {
      list:     (q = '')  => get(`/api/inventory${q}`),
      get:      (id)      => get(`/api/inventory/${id}`),
      create:   (d)       => post('/api/inventory', d),
      update:   (id, d)   => patch(`/api/inventory/${id}`, d),
      delete:   (id)      => del(`/api/inventory/${id}`),
      adjust:   (id, d)   => post(`/api/inventory/${id}/adjust`, d),
    },
    requests: {
      list:     (q = '')  => get(`/api/requests${q}`),
      get:      (id)      => get(`/api/requests/${id}`),
      create:   (d)       => post('/api/requests', d),
      update:   (id, d)   => patch(`/api/requests/${id}`, d),
      approve:  (id)      => patch(`/api/requests/${id}/approve`, { action: 'approved' }),
      reject:   (id, r)   => patch(`/api/requests/${id}/reject`, { reason: r }),
      complete: (id)      => post(`/api/requests/${id}/complete`, {}),
      delete:   (id)      => del(`/api/requests/${id}`),
    },
    production: {
      list:     (q = '')  => get(`/api/production${q}`),
      get:      (id)      => get(`/api/production/${id}`),
      create:   (d)       => post('/api/production', d),
      update:   (id, d)   => patch(`/api/production/${id}`, d),
      complete: (id, d)   => post(`/api/production/${id}/complete`, d),
      delete:   (id)      => del(`/api/production/${id}`),
    },
    finishedGoods: {
      list:     (q = '')  => get(`/api/finished-goods${q}`),
      get:      (id)      => get(`/api/finished-goods/${id}`),
      create:   (d)       => post('/api/finished-goods', d),
      update:   (id, d)   => patch(`/api/finished-goods/${id}`, d),
      delete:   (id)      => del(`/api/finished-goods/${id}`),
    },
    shipping: {
      list:     (q = '')  => get(`/api/shipping${q}`),
      get:      (id)      => get(`/api/shipping/${id}`),
      create:   (d)       => post('/api/shipping', d),
      update:   (id, d)   => patch(`/api/shipping/${id}`, d),
      dispatch: (id)      => post(`/api/shipping/${id}/dispatch`, {}),
      deliver:  (id)      => post(`/api/shipping/${id}/deliver`, {}),
      delete:   (id)      => del(`/api/shipping/${id}`),
    },
    reports: {
      dashboard:  ()      => get('/api/reports/dashboard'),
      inventory:  (q='')  => get(`/api/reports/inventory${q}`),
      production: (q='')  => get(`/api/reports/production${q}`),
      shipping:   (q='')  => get(`/api/reports/shipping${q}`),
      summary:    ()      => get('/api/reports/summary'),
    },
    audit: {
      list: (q = '')      => get(`/api/audit${q}`),
    },
    settings: {
      get:    ()    => get('/api/settings'),
      patch:  (d)   => patch('/api/settings', d),
    },
    notifications: {
      list:       ()      => get('/api/notifications'),
      unread:     ()      => get('/api/notifications/unread'),
      markRead:   (id)    => patch(`/api/notifications/${id}/read`, {}),
      markAllRead:()      => patch('/api/notifications/read-all', {}),
      delete:     (id)    => del(`/api/notifications/${id}`),
    },
    // raw methods for edge cases
    get, post, put, patch, del,
  };
})();
