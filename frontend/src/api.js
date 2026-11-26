const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, errors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError('Unable to connect to the server. Check that the API is running.');
  }

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const isAuthEntryPoint = [
      '/auth/login',
      '/auth/register',
      '/auth/me',
    ].some((entryPoint) => path.startsWith(entryPoint));

    if (response.status === 401 && !isAuthEntryPoint) {
      window.dispatchEvent(new Event('peoplehub:unauthorized'));
    }

    throw new ApiError(
      payload?.error || 'The request could not be completed.',
      response.status,
      payload?.errors || {},
    );
  }

  return payload;
}

export function registerAccount(account) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(account),
  });
}

export function login(credentials) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export function getCurrentUser(options) {
  return request('/auth/me', options);
}

export function listAuditLogs(params, options) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  }

  return request(`/audit-logs?${query.toString()}`, options);
}

export function listEmployees(params, options) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  }

  return request(`/employees?${query.toString()}`, options);
}

export function getDepartments(options) {
  return request('/employees/departments', options);
}

export function createEmployee(employee) {
  return request('/employees', {
    method: 'POST',
    body: JSON.stringify(employee),
  });
}

export function updateEmployee(id, employee) {
  return request(`/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(employee),
  });
}

export function deleteEmployee(id) {
  return request(`/employees/${id}`, { method: 'DELETE' });
}
