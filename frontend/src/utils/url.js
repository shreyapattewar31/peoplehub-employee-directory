const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const configuredPublicUrl = (import.meta.env.VITE_PUBLIC_APP_URL || '').replace(/\/+$/, '');

function currentPublicUrl() {
  return configuredPublicUrl || window.location.origin;
}

export function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return new URL(path).toString();
  }

  const base = configuredApiBase.startsWith('http')
    ? configuredApiBase
    : `${window.location.origin}${configuredApiBase.startsWith('/') ? configuredApiBase : `/${configuredApiBase}`}`;

  return new URL(String(path).replace(/^\/+/, ''), `${base}/`).toString();
}

export function buildPublicUrl(path) {
  return new URL(String(path).replace(/^\/+/, ''), `${currentPublicUrl()}/`).toString();
}

export function employeePhotoUrl(employee) {
  if (!employee?.photo_url || /^https?:\/\//i.test(employee.photo_url)) {
    return employee?.photo_url || '';
  }

  const apiPath = new URL(configuredApiBase, currentPublicUrl()).pathname.replace(/\/+$/, '');
  const photoPath = employee.photo_url.replace(/^\/+/, '');
  const relativePath = apiPath && (photoPath === apiPath.slice(1) || photoPath.startsWith(`${apiPath.slice(1)}/`))
    ? photoPath.slice(apiPath.length) || '/'
    : employee.photo_url;

  return buildApiUrl(relativePath);
}
