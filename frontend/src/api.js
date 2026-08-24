const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getWorkerToken() {
  return localStorage.getItem('workerToken');
}

function getAdminPassword() {
  return sessionStorage.getItem('adminPassword');
}

async function request(path, { method = 'GET', body, auth = 'worker', headers = {} } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };

  if (auth === 'worker') {
    const token = getWorkerToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  } else if (auth === 'admin') {
    const password = getAdminPassword();
    if (password) finalHeaders['x-admin-password'] = password;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && data?.error) || `Errore ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  API_URL,
  health: () => request('/api/health', { auth: 'none' }),

  // Auth
  listWorkersPublic: () => request('/api/auth/workers', { auth: 'none' }),
  workerLogin: (workerId, pin) =>
    request('/api/auth/worker-login', { method: 'POST', body: { workerId, pin }, auth: 'none' }),
  adminLogin: (password) =>
    request('/api/auth/admin-login', { method: 'POST', body: { password }, auth: 'none' }),
  registerWorker: (name, pin) =>
    request('/api/auth/register-worker', { method: 'POST', body: { name, pin }, auth: 'none' }),

  // Voice / sessions
  voiceStatus: () => request('/api/voice/status'),
  startDay: (transcript) => request('/api/voice/start-day', { method: 'POST', body: { transcript } }),
  endDay: (transcript) => request('/api/voice/end-day', { method: 'POST', body: { transcript } }),

  // Reports
  myReports: () => request('/api/reports/mine'),
  allReports: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/reports${qs ? `?${qs}` : ''}`, { auth: 'admin' });
  },
  reportPdfUrl: (id) => `${API_URL}/api/reports/${id}/pdf?token=${getWorkerToken() || ''}`,

  // Settings
  getSettings: () => request('/api/settings', { auth: 'none' }),
  updateSettings: (settings) => request('/api/settings', { method: 'PUT', body: settings, auth: 'admin' }),

  // Workers (admin)
  listWorkers: () => request('/api/workers', { auth: 'admin' }),
  createWorker: (worker) => request('/api/workers', { method: 'POST', body: worker, auth: 'admin' }),
  updateWorker: (id, worker) => request(`/api/workers/${id}`, { method: 'PUT', body: worker, auth: 'admin' }),
  deleteWorker: (id) => request(`/api/workers/${id}`, { method: 'DELETE', auth: 'admin' }),

  // Vehicles
  listVehicles: () => request('/api/vehicles', { auth: 'none' }),
  createVehicle: (vehicle) => request('/api/vehicles', { method: 'POST', body: vehicle, auth: 'admin' }),
  updateVehicle: (id, vehicle) => request(`/api/vehicles/${id}`, { method: 'PUT', body: vehicle, auth: 'admin' }),
  deleteVehicle: (id) => request(`/api/vehicles/${id}`, { method: 'DELETE', auth: 'admin' }),

  // Jobsites
  listJobsites: () => request('/api/jobsites', { auth: 'none' }),
  createJobsite: (jobsite) => request('/api/jobsites', { method: 'POST', body: jobsite, auth: 'admin' }),
  updateJobsite: (id, jobsite) => request(`/api/jobsites/${id}`, { method: 'PUT', body: jobsite, auth: 'admin' }),
  deleteJobsite: (id) => request(`/api/jobsites/${id}`, { method: 'DELETE', auth: 'admin' }),

  // Push
  getPushPublicKey: () => request('/api/push/public-key', { auth: 'none' }),
  subscribePush: (subscription) => request('/api/push/subscribe', { method: 'POST', body: { subscription } }),
};

export function saveWorkerSession(token) {
  localStorage.setItem('workerToken', token);
}

export function clearWorkerSession() {
  localStorage.removeItem('workerToken');
}

export function saveAdminPassword(password) {
  sessionStorage.setItem('adminPassword', password);
}

export function clearAdminPassword() {
  sessionStorage.removeItem('adminPassword');
}

export function isWorkerLoggedIn() {
  return Boolean(getWorkerToken());
}

export function isAdminLoggedIn() {
  return Boolean(getAdminPassword());
}
