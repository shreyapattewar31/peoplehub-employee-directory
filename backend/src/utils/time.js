export function toUtcIso(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = String(value).trim();
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const date = new Date(hasTimeZone ? text : `${text.replace(' ', 'T')}Z`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
