const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9()\s.-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateEmployee(values) {
  const errors = {};

  if (!values.name.trim()) {
    errors.name = 'Full name is required.';
  } else if (values.name.trim().length > 100) {
    errors.name = 'Full name must be 100 characters or fewer.';
  }

  if (!values.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  } else if (values.email.trim().length > 255) {
    errors.email = 'Email address must be 255 characters or fewer.';
  }

  const phoneDigits = values.phone.replace(/\D/g, '');
  if (!values.phone.trim()) {
    errors.phone = 'Phone number is required.';
  } else if (!PHONE_PATTERN.test(values.phone.trim()) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.phone = 'Enter a valid phone number with 7 to 15 digits.';
  }

  if (!values.department.trim()) {
    errors.department = 'Department is required.';
  } else if (values.department.trim().length > 100) {
    errors.department = 'Department must be 100 characters or fewer.';
  }

  if (!values.designation.trim()) {
    errors.designation = 'Designation is required.';
  } else if (values.designation.trim().length > 100) {
    errors.designation = 'Designation must be 100 characters or fewer.';
  }

  if (!values.salary.trim()) {
    errors.salary = 'Salary is required.';
  } else if (!MONEY_PATTERN.test(values.salary.trim()) || Number(values.salary) > 9999999999.99) {
    errors.salary = 'Enter a valid salary with no more than two decimal places.';
  }

  if (!values.joining_date) {
    errors.joining_date = 'Joining date is required.';
  } else if (!isValidDate(values.joining_date)) {
    errors.joining_date = 'Enter a valid joining date.';
  }

  return errors;
}
