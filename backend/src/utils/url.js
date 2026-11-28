export function normalizeBaseUrl(value, name = 'URL') {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`${name} must be a valid HTTP or HTTPS URL without credentials.`);
  }
}

export function buildUrl(base, path) {
  return new URL(String(path).replace(/^\/+/, ''), `${normalizeBaseUrl(base)}/`).toString();
}

export function normalizeGoogleFormUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const isGoogleForm = url.protocol === 'https:'
      && !url.username
      && !url.password
      && ((url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'))
        || url.hostname === 'forms.gle');

    if (!isGoogleForm) {
      throw new Error();
    }

    return url.toString();
  } catch {
    return null;
  }
}
