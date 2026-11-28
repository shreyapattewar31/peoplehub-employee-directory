import { buildApiUrl } from './utils/url.js';

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
    response = await fetch(buildApiUrl(path), {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
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

function queryString(params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  }

  const text = query.toString();
  return text ? `?${text}` : '';
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

export function getOnboardingConfig(options) {
  return request('/onboarding/config', options);
}

export function createOnboardingApplication(profile) {
  return request('/onboarding/applications', {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
}

export function getOnboardingApplication(id, options) {
  return request(`/onboarding/applications/${encodeURIComponent(id)}`, options);
}

export function updateOnboardingApplication(id, profile) {
  return request(`/onboarding/applications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ profile }),
  });
}

export function createOnboardingDocumentUpload(id, type, filename) {
  return request(`/onboarding/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(type)}/sign`, {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });
}

export function completeOnboardingDocument(id, type) {
  return request(`/onboarding/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(type)}/complete`, {
    method: 'POST',
  });
}

export async function uploadOnboardingDocument(id, type, file) {
  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError('Document must be 5 MB or smaller.', 400, { document: 'Document must be 5 MB or smaller.' });
  }

  const signatureResponse = await createOnboardingDocumentUpload(id, type, file.name);
  const signature = signatureResponse.data;
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signature.apiKey);
  body.append('timestamp', signature.timestamp);
  body.append('signature', signature.signature);
  body.append('public_id', signature.publicId);
  body.append('type', 'authenticated');
  if (signature.uploadPreset) {
    body.append('upload_preset', signature.uploadPreset);
  }

  let uploadResponse;
  try {
    uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/${signature.resourceType}/upload`,
      { method: 'POST', body },
    );
  } catch {
    throw new ApiError('The document could not be uploaded. Check your connection and try again.');
  }

  const uploadPayload = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || uploadPayload?.public_id !== signature.publicId) {
    throw new ApiError(uploadPayload?.error?.message || 'The document upload failed.');
  }

  return completeOnboardingDocument(id, type);
}

export function submitOnboardingApplication(id, account) {
  return request(`/onboarding/applications/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    body: JSON.stringify(account),
  });
}

export function listOnboardingApplications(params, options) {
  return request(`/admin/onboarding/applications${queryString(params)}`, options);
}

export function getOnboardingReview(id, options) {
  return request(`/admin/onboarding/applications/${encodeURIComponent(id)}`, options);
}

export function verifyOnboardingDocument(id, type, decision) {
  return request(`/admin/onboarding/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(type)}/verify`, {
    method: 'POST',
    body: JSON.stringify(decision),
  });
}

export function decideOnboardingApplication(id, decision) {
  return request(`/admin/onboarding/applications/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(decision),
  });
}

export function getMyEmployeePortal(options) {
  return request('/me', options);
}

export function listMyAttendance(params, options) {
  return request(`/me/attendance${queryString(params)}`, options);
}

export function punchAttendance(punch) {
  return request('/me/attendance/punch', {
    method: 'POST',
    body: JSON.stringify(punch),
  });
}

export function listMyLeave(options) {
  return request('/me/leave', options);
}

export function createLeaveRequest(leave) {
  return request('/me/leave', {
    method: 'POST',
    body: JSON.stringify(leave),
  });
}

export function cancelLeaveRequest(id) {
  return request(`/me/leave/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export function listAdminAttendance(params, options) {
  return request(`/admin/workforce/attendance${queryString(params)}`, options);
}

export function listAdminLeave(params, options) {
  return request(`/admin/workforce/leave${queryString(params)}`, options);
}

export function decideLeaveRequest(id, decision) {
  return request(`/admin/workforce/leave/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(decision),
  });
}

export function saveOnboardingFormLink(url, turnstile = {}) {
  return request('/onboarding/form-link', {
    method: 'POST',
    body: JSON.stringify({ url, ...turnstile }),
  });
}

export function listAuditLogs(params, options) {
  return request(`/audit-logs${queryString(params)}`, options);
}

export function listEmployees(params, options) {
  return request(`/employees${queryString(params)}`, options);
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
  return request(`/employees/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(employee),
  });
}

export function patchEmployee(id, employee) {
  return request(`/employees/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(employee),
  });
}

export function deleteEmployee(id, turnstile = {}) {
  return request(`/employees/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify(turnstile),
  });
}

export function uploadEmployeePhoto(id, photo, turnstile = {}) {
  const body = new FormData();
  body.append('photo', photo);
  for (const [key, value] of Object.entries(turnstile)) {
    body.append(key, value);
  }
  return request(`/employees/${encodeURIComponent(id)}/photo`, { method: 'POST', body });
}

export function deleteEmployeePhoto(id, turnstile = {}) {
  return request(`/employees/${encodeURIComponent(id)}/photo`, {
    method: 'DELETE',
    body: JSON.stringify(turnstile),
  });
}

export function getAdminSettings(options) {
  return request('/admin/settings', options);
}

export function saveAdminSettings(settings, turnstile = {}) {
  return request('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ ...settings, ...turnstile }),
  });
}

export function sendTestEmail(to, turnstile = {}) {
  return request('/admin/email/test', {
    method: 'POST',
    body: JSON.stringify({ to, ...turnstile }),
  });
}

export function listSystemLogs(params, options) {
  return request(`/admin/logs${queryString(params)}`, options);
}

export async function downloadBackup({ dataset = 'all', format = 'json' } = {}) {
  const path = `/admin/backup${queryString({ dataset, format })}`;
  let response;

  try {
    response = await fetch(buildApiUrl(path), { credentials: 'include', headers: { Accept: '*/*' } });
  } catch {
    throw new ApiError('Unable to connect to the server. Check that the API is running.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      window.dispatchEvent(new Event('peoplehub:unauthorized'));
    }
    throw new ApiError(payload?.error || 'The backup could not be downloaded.', response.status, payload?.errors || {});
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1]
    || `peoplehub-${dataset}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename };
}
