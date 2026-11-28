const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateRegistration(input) {
  const errors = {};
  const value = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      errors: { form: 'Account details must be provided as an object.' },
      value,
    };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const registrationSource = input.registrationSource === 'onboarding' ? 'onboarding' : 'standard';
  value.registrationSource = registrationSource;

  if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  } else {
    value.name = name;
  }

  if (!email) {
    errors.email = 'Email is required.';
  } else if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  } else {
    value.email = email;
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.password = 'Password must be 72 bytes or fewer.';
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must include at least one letter and one number.';
  } else {
    value.password = password;
  }

  return { errors, value };
}

export function validateLogin(input) {
  const errors = {};
  const value = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      errors: { form: 'Login details must be provided as an object.' },
      value,
    };
  }

  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';

  if (!email || email.length > 255 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  } else {
    value.email = email;
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length > 128) {
    errors.password = 'Password is too long.';
  } else {
    value.password = password;
  }

  return { errors, value };
}
