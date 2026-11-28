const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getBusinessDate(instant = new Date(), timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function inclusiveDayCount(startDate, endDate) {
  const milliseconds = new Date(`${endDate}T00:00:00.000Z`).getTime()
    - new Date(`${startDate}T00:00:00.000Z`).getTime();
  return Math.round(milliseconds / 86_400_000) + 1;
}
