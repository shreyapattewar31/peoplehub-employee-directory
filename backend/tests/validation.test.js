import test from 'node:test';
import assert from 'node:assert/strict';
import { parseListQuery, validateEmployee, validateId } from '../src/validation.js';

const validEmployee = {
  name: 'Avery Morgan',
  email: 'Avery@Example.com',
  phone: '+1 (415) 555-0132',
  department: 'Engineering',
  designation: 'Software Engineer',
  salary: 95000.5,
  joining_date: '2026-11-01',
};

test('valid employee data is normalized', () => {
  const result = validateEmployee(validEmployee);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.email, 'avery@example.com');
  assert.equal(result.value.salary, 95000.5);
});

test('missing required fields produce field errors', () => {
  const result = validateEmployee({});
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'department',
    'designation',
    'email',
    'joining_date',
    'name',
    'phone',
    'salary',
  ]);
});

test('invalid email, phone, salary, and date are rejected', () => {
  const result = validateEmployee({
    ...validEmployee,
    email: 'not-an-email',
    phone: '123',
    salary: -10,
    joining_date: '2026-02-30',
  });

  assert.ok(result.errors.email);
  assert.ok(result.errors.phone);
  assert.ok(result.errors.salary);
  assert.ok(result.errors.joining_date);
});

test('salary allows zero and two decimal places', () => {
  assert.deepEqual(validateEmployee({ ...validEmployee, salary: '0.00' }).errors, {});
  assert.deepEqual(validateEmployee({ ...validEmployee, salary: '1234.56' }).errors, {});
  assert.ok(validateEmployee({ ...validEmployee, salary: '1234.567' }).errors.salary);
});

test('partial validation only checks supplied fields', () => {
  const result = validateEmployee({ designation: 'Team Lead' }, { partial: true });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, { designation: 'Team Lead' });
});

test('IDs must be positive safe integers', () => {
  assert.equal(validateId('12'), 12);
  assert.equal(validateId('0'), null);
  assert.equal(validateId('-1'), null);
  assert.equal(validateId('abc'), null);
});

test('list query accepts supported filters and sorting', () => {
  const result = parseListQuery({
    page: '2',
    limit: '25',
    search: ' Avery ',
    department: 'Engineering',
    sortBy: 'salary',
    sortOrder: 'DESC',
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.value.search, 'Avery');
  assert.equal(result.value.sortOrder, 'desc');
});

test('list query rejects unsupported sorting and invalid pagination', () => {
  const result = parseListQuery({ page: '0', limit: '500', sortBy: 'id; DROP TABLE employees' });
  assert.ok(result.errors.page);
  assert.ok(result.errors.limit);
  assert.ok(result.errors.sortBy);
});
