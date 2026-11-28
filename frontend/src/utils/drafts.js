const SENSITIVE_FIELDS = new Set([
  'password',
  'confirmPassword',
  'captchaAnswer',
  'captchaToken',
  'cf-turnstile-response',
  'turnstileToken',
  'token',
  'secret',
]);

function draftKey(key) {
  return `peoplehub.draft.${key}`;
}

function safeDraftValues(values, excluded = []) {
  return Object.fromEntries(
    Object.entries(values).filter(([field]) => !SENSITIVE_FIELDS.has(field) && !excluded.includes(field)),
  );
}

export function readDraft(key, fallback, excluded = []) {
  try {
    const stored = window.localStorage.getItem(draftKey(key));
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback;
    }
    return { ...fallback, ...safeDraftValues(parsed, excluded) };
  } catch {
    return fallback;
  }
}

export function writeDraft(key, values, excluded = []) {
  try {
    const safeValues = safeDraftValues(values, excluded);
    window.localStorage.setItem(draftKey(key), JSON.stringify(safeValues));
  } catch {
    // Draft persistence is optional and must never change the form result.
  }
}

export function clearDraft(key) {
  try {
    window.localStorage.removeItem(draftKey(key));
  } catch {
    // A successful server mutation remains successful when storage is unavailable.
  }
}
