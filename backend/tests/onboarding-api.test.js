import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRateLimiters } from '../src/middleware/rateLimiters.js';

const admin = { id: 1, name: 'Test Admin', email: 'admin@example.com', role: 'admin' };
const employee = {
  id: 7,
  name: 'Avery Morgan',
  email: 'avery@example.com',
  phone: '+1 (415) 555-0132',
  department: 'Engineering',
  designation: 'Software Engineer',
  salary: 95000.5,
  joining_date: '2026-11-01',
  created_at: '2026-11-26 10:00:00',
};
const payload = {
  responseId: 'google-response-123',
  employee: {
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    department: employee.department,
    designation: employee.designation,
    salary: employee.salary,
    joining_date: employee.joining_date,
  },
};

function createMockDatabase(results) {
  const calls = [];
  const queue = [...results];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const result = queue.shift();

      if (result instanceof Error) {
        throw result;
      }

      if (!result) {
        throw new Error(`Unexpected database query: ${sql}`);
      }

      return result;
    },
  };
}

async function withServer(database, run, user = admin) {
  const authMiddleware = (req, res, next) => {
    req.user = user;
    next();
  };
  const server = createApp(database, {
    authMiddleware,
    turnstileMiddleware: (req, res, next) => next(),
    rateLimiters: createRateLimiters({ enabled: false }),
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function submit(baseUrl, body = payload, token = 'test-token') {
  return fetch(`${baseUrl}/api/onboarding/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

test('onboarding config is admin-only and returns the integration fields', async () => {
  const database = createMockDatabase([
    [[{ setting_value: 'test-token' }]],
    [[{ setting_value: 'https://forms.gle/example' }]],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/onboarding/config`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.token, 'test-token');
    assert.equal(body.data.webhookPath, '/onboarding/submissions');
    assert.deepEqual(body.data.fields.map((field) => field.key), [
      'name', 'email', 'phone', 'department', 'designation', 'salary', 'joining_date',
    ]);
  });

  const memberDatabase = createMockDatabase([]);
  await withServer(memberDatabase, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/onboarding/config`);
    assert.equal(response.status, 403);
    assert.equal(memberDatabase.calls.length, 0);
  }, { id: 2, name: 'Member', email: 'member@example.com', role: 'user' });
});

test('form webhook rejects an invalid token before importing data', async () => {
  const database = createMockDatabase([[[{ setting_value: 'test-token' }]]]);

  await withServer(database, async (baseUrl) => {
    const response = await submit(baseUrl, payload, 'wrong-token');
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Invalid onboarding webhook token/);
    assert.equal(database.calls.length, 1);
  });
});

test('form webhook validates employee fields before querying employee data', async () => {
  const database = createMockDatabase([[[{ setting_value: 'test-token' }]]]);

  await withServer(database, async (baseUrl) => {
    const response = await submit(baseUrl, {
      responseId: 'google-response-123',
      employee: { name: 'Avery', email: 'invalid' },
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.email);
    assert.ok(body.errors.phone);
    assert.equal(database.calls.length, 1);
  });
});

test('form webhook creates an employee, submission record, and audit entry', async () => {
  const database = createMockDatabase([
    [[{ setting_value: 'test-token' }]],
    [[admin]],
    [[]],
    [{ insertId: 7 }],
    [[employee]],
    [{}],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await submit(baseUrl);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.id, 7);
    assert.equal(body.duplicate, false);
    assert.match(database.calls[3].sql, /INSERT INTO employees/);
    assert.equal(database.calls[3].params[0], employee.name);
    assert.match(database.calls[5].sql, /INSERT INTO onboarding_submissions/);
    assert.equal(database.calls[5].params[0], payload.responseId);
    assert.match(database.calls[6].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[6].params[3], 'employee.created');
    assert.match(database.calls[6].params[6], /Google Forms/);
    assert.equal(JSON.parse(database.calls[6].params[7]).responseId, payload.responseId);
  });
});

test('repeated Google Form response is idempotent', async () => {
  const database = createMockDatabase([
    [[{ setting_value: 'test-token' }]],
    [[admin]],
    [[{ employee_id: 7 }]],
    [[employee]],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await submit(baseUrl);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.duplicate, true);
    assert.equal(body.data.id, 7);
    assert.equal(database.calls.some((call) => /INSERT INTO employees/.test(call.sql)), false);
    assert.equal(database.calls.some((call) => /INSERT INTO audit_logs/.test(call.sql)), false);
  });
});

test('form webhook returns a conflict for a duplicate employee email', async () => {
  const duplicateError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
  const database = createMockDatabase([
    [[{ setting_value: 'test-token' }]],
    [[admin]],
    [[]],
    duplicateError,
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await submit(baseUrl);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already exists/);
  });
});

test('form webhook requires an administrator audit actor', async () => {
  const database = createMockDatabase([
    [[{ setting_value: 'test-token' }]],
    [[]],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await submit(baseUrl);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /administrator account is required/i);
    assert.equal(database.calls.length, 2);
  });
});
