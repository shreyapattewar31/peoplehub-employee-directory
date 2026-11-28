import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRateLimiters } from '../src/middleware/rateLimiters.js';

const employee = {
  id: 7,
  name: 'Avery Morgan',
  email: 'avery@example.com',
  phone: '+1 (415) 555-0132',
  department: 'Engineering',
  designation: 'Software Engineer',
  salary: 95000.5,
  joining_date: '2026-11-01',
  created_at: '2026-11-24 10:00:00',
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

async function withServer(database, run, user = {
  id: 1,
  name: 'Test Admin',
  email: 'admin@example.com',
  role: 'admin',
}) {
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

test('GET employees uses parameters and returns pagination', async () => {
  const database = createMockDatabase([
    [[{ total: 1 }]],
    [[employee]],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/employees?search=Avery&department=Engineering&sortBy=salary&sortOrder=desc`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data[0].name, 'Avery Morgan');
    assert.equal(body.pagination.total, 1);
    assert.equal(database.calls[0].params[0], '%Avery%');
    assert.match(database.calls[1].sql, /ORDER BY salary DESC/);
    assert.match(database.calls[1].sql, /LIMIT \? OFFSET \?/);
  });
});

test('POST validates input and inserts a parameterized employee', async () => {
  const database = createMockDatabase([
    [{ insertId: 7 }],
    [[employee]],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const payload = {
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      salary: employee.salary,
      joining_date: employee.joining_date,
    };
    const response = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.id, 7);
    assert.equal(database.calls[0].params[6], '2026-11-01');
    assert.ok(!database.calls[0].sql.includes('Avery Morgan'));
    assert.match(database.calls[2].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[2].params[0], 1);
    assert.equal(database.calls[2].params[3], 'employee.created');
    assert.equal(database.calls[2].params[5], 7);
  });
});

test('POST rejects invalid data before querying the database', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Avery', email: 'invalid' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.email);
    assert.equal(database.calls.length, 0);
  });
});

test('POST returns a meaningful conflict for duplicate email', async () => {
  const duplicateError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
  const database = createMockDatabase([duplicateError]);

  await withServer(database, async (baseUrl) => {
    const payload = {
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      salary: employee.salary,
      joining_date: employee.joining_date,
    };
    const response = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already exists/);
  });
});

test('PUT updates an existing employee', async () => {
  const updatedEmployee = { ...employee, designation: 'Team Lead' };
  const database = createMockDatabase([
    [[employee]],
    [{ affectedRows: 1 }],
    [[updatedEmployee]],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const payload = {
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      designation: 'Team Lead',
      salary: employee.salary,
      joining_date: employee.joining_date,
    };
    const response = await fetch(`${baseUrl}/api/employees/7`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.designation, 'Team Lead');
    assert.equal(database.calls[1].params[4], 'Team Lead');
    assert.equal(database.calls[1].params[7], 7);
    assert.match(database.calls[3].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[3].params[3], 'employee.updated');
    assert.match(database.calls[3].params[6], /designation/);
  });
});

test('DELETE returns 204, retires the employee, and records an audit event', async () => {
  const database = createMockDatabase([
    [[employee]],
    [{ affectedRows: 1 }],
    [{ affectedRows: 0 }],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/7`, { method: 'DELETE' });

    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.match(database.calls[1].sql, /UPDATE employees[\s\S]*SET deleted_at = UTC_TIMESTAMP/);
    assert.deepEqual(database.calls[1].params, [7]);
    assert.match(database.calls[2].sql, /UPDATE users SET status = 'blocked'/);
    assert.match(database.calls[3].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[3].params[3], 'employee.deleted');
    assert.match(database.calls[3].params[6], /Avery Morgan/);
  });
});

test('PATCH records changed fields in the audit log', async () => {
  const updatedEmployee = { ...employee, department: 'Platform' };
  const database = createMockDatabase([
    [[employee]],
    [{ affectedRows: 1 }],
    [[updatedEmployee]],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/7`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department: 'Platform' }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.department, 'Platform');
    assert.equal(database.calls[3].params[3], 'employee.updated');
    assert.match(database.calls[3].params[6], /department/);
  });
});

test('non-admin accounts cannot access employee data', async () => {
  const database = createMockDatabase([]);
  const member = { id: 2, name: 'Team Member', email: 'member@example.com', role: 'user' };
  const payload = {
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    department: employee.department,
    designation: employee.designation,
    salary: employee.salary,
    joining_date: employee.joining_date,
  };
  const requests = [
    { method: 'GET', path: '/api/employees' },
    { method: 'GET', path: '/api/employees/departments' },
    { method: 'GET', path: '/api/employees/7' },
    { method: 'POST', path: '/api/employees', body: payload },
    { method: 'PUT', path: '/api/employees/7', body: payload },
    { method: 'PATCH', path: '/api/employees/7', body: { designation: 'Lead' } },
    { method: 'DELETE', path: '/api/employees/7' },
  ];

  await withServer(database, async (baseUrl) => {
    for (const request of requests) {
      const response = await fetch(`${baseUrl}${request.path}`, {
        method: request.method,
        headers: request.body ? { 'Content-Type': 'application/json' } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /Administrator access/);
    }

    assert.equal(database.calls.length, 0);
  }, member);
});

test('GET unknown employee returns 404', async () => {
  const database = createMockDatabase([[[]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/999`);

    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'Employee not found.');
  });
});
