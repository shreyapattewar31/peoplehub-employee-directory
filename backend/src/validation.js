import { AUDIT_ACTIONS } from './audit.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9()\s.-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const SORT_COLUMNS = new Set([
  'name',
  'email',
  'department',
  'designation',
  'salary',
  'joining_date',
]);
const AUDIT_ACTION_VALUES = new Set(AUDIT_ACTIONS);

const FIELD_LIMITS = {
  name: 100,
  email: 255,
  phone: 20,
  department: 100,
  designation: 100,
};

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateEmployee(input, { partial = false } = {}) {
  const errors = {};
  const value = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      errors: { form: 'Employee details must be provided as an object.' },
      value,
    };
  }

  for (const [field, maxLength] of Object.entries(FIELD_LIMITS)) {
    if (partial && !Object.hasOwn(input, field)) {
      continue;
    }

    const rawValue = input[field];
    const fieldValue = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (!fieldValue) {
      errors[field] = `${field.replace('_', ' ')} is required.`;
      continue;
    }

    if (fieldValue.length > maxLength) {
      errors[field] = `${field.replace('_', ' ')} must be ${maxLength} characters or fewer.`;
      continue;
    }

    value[field] = field === 'email' ? fieldValue.toLowerCase() : fieldValue;
  }

  if (value.email && !EMAIL_PATTERN.test(value.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (value.phone) {
    const digitCount = value.phone.replace(/\D/g, '').length;
    if (!PHONE_PATTERN.test(value.phone) || digitCount < 7 || digitCount > 15) {
      errors.phone = 'Enter a valid phone number with 7 to 15 digits.';
    }
  }

  if (!partial || Object.hasOwn(input, 'salary')) {
    const rawSalary = input.salary;
    const salaryText = String(rawSalary ?? '').trim();
    const salary = Number(salaryText);

    if (!salaryText) {
      errors.salary = 'Salary is required.';
    } else if (!MONEY_PATTERN.test(salaryText) || !Number.isFinite(salary)) {
      errors.salary = 'Salary must be a number with no more than two decimal places.';
    } else if (salary < 0) {
      errors.salary = 'Salary cannot be negative.';
    } else if (salary > 9999999999.99) {
      errors.salary = 'Salary is too large.';
    } else {
      value.salary = salary;
    }
  }

  if (!partial || Object.hasOwn(input, 'joining_date')) {
    const joiningDate = typeof input.joining_date === 'string'
      ? input.joining_date.trim()
      : '';

    if (!joiningDate) {
      errors.joining_date = 'Joining date is required.';
    } else if (!isValidDate(joiningDate)) {
      errors.joining_date = 'Enter a valid joining date.';
    } else {
      value.joining_date = joiningDate;
    }
  }

  return { errors, value };
}

export function validateId(id) {
  const text = String(id);
  const value = Number(text);

  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1) {
    return null;
  }

  return value;
}

export function parseAuditLogQuery(query) {
  const errors = {};
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  const action = String(query.action ?? '').trim();
  const entityType = String(query.entityType ?? '').trim();
  const search = String(query.search ?? '').trim().slice(0, 200);

  if (!Number.isInteger(page) || page < 1) {
    errors.page = 'Page must be a positive integer.';
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.limit = 'Limit must be an integer between 1 and 100.';
  }

  if (action && !AUDIT_ACTION_VALUES.has(action)) {
    errors.action = 'Invalid audit action.';
  }

  if (entityType && !['account', 'employee', 'onboarding', 'attendance', 'leave', 'system'].includes(entityType)) {
    errors.entityType = 'Invalid entity type.';
  }

  return { errors, value: { page, limit, action, entityType, search } };
}

export function parseListQuery(query) {
  const errors = {};
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  const sortBy = String(query.sortBy ?? 'name');
  const sortOrder = String(query.sortOrder ?? 'asc').toLowerCase();

  if (!Number.isInteger(page) || page < 1) {
    errors.page = 'Page must be a positive integer.';
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.limit = 'Limit must be an integer between 1 and 100.';
  }

  if (!SORT_COLUMNS.has(sortBy)) {
    errors.sortBy = 'Invalid sort field.';
  }

  if (!['asc', 'desc'].includes(sortOrder)) {
    errors.sortOrder = 'Sort order must be asc or desc.';
  }

  return {
    errors,
    value: {
      page,
      limit,
      search: String(query.search ?? '').trim().slice(0, 200),
      department: String(query.department ?? '').trim().slice(0, 100),
      sortBy,
      sortOrder,
    },
  };
}
