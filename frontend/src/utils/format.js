import { getDisplayPreferences } from './preferences.js';

const salaryFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatSalary(value) {
  return salaryFormatter.format(Number(value) || 0);
}

function safeTimeZone() {
  const timezone = getDisplayPreferences().timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return 'UTC';
  }
}

function formatCalendarDate(date, timeZone) {
  const { dateFormat } = getDisplayPreferences();
  if (dateFormat === 'iso') {
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    });
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: dateFormat === 'numeric' ? '2-digit' : 'short',
    day: dateFormat === 'dayFirst' ? '2-digit' : 'numeric',
    timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  if (dateFormat === 'dayFirst') {
    return `${values.day}/${values.month}/${values.year}`;
  }

  if (dateFormat === 'numeric') {
    return `${values.month}/${values.day}/${values.year}`;
  }

  return `${values.month} ${values.day}, ${values.year}`;
}

export function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '—' : formatCalendarDate(date, 'UTC');
}

export function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const text = String(value).trim();
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const date = new Date(hasTimeZone ? text : `${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const { timeFormat } = getDisplayPreferences();
  const timeZone = safeTimeZone();
  const dateText = formatCalendarDate(date, timeZone);
  const timeText = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat !== '24h',
    timeZone,
  }).format(date);

  return `${dateText}, ${timeText}`;
}

export function getInitials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
