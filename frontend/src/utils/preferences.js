const STORAGE_KEY = 'peoplehub.displayPreferences';
const DEFAULT_PREFERENCES = {
  timezone: 'UTC',
  dateFormat: 'short',
  timeFormat: '12h',
};

export function getDisplayPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_PREFERENCES, ...stored };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveDisplayPreferences(preferences) {
  const next = { ...DEFAULT_PREFERENCES, ...preferences };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Display preferences still apply for the current session without storage.
  }
  window.dispatchEvent(new CustomEvent('peoplehub:preferences', { detail: next }));
  return next;
}
