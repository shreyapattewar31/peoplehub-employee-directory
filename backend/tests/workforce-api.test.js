import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createMeRouter } from '../src/routes/me.js';
import { createAdminWorkforceRouter } from '../src/routes/adminWorkforce.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';

const employee = { id: 7, employee_id: 7, name: 'Jordan Lee', email: 'jordan@example.com', role: 'user', status: 'active' };
const admin = { id: 1, name: 'Test Admin', email: 'admin@example.com', role: 'admin' };
const leave = {
  id: 3,
  employee_id: 7,
  employee_name: employee.name,
  employee_email: employee.email,
  leave_type: 'casual',
  start_date: '2026-12-01',
  end_date: '2026-12-03',
  day_count: 3,
  reason: 'Family event',
  status: 'pending',
  decision_comment: null,
  decided_by: null,
  decided_at: null,
  created_at: new Date('2026-11-28T07:00:00Z'),
};

function createMockDatabase(results = []) {
  const calls = [];
  const queue = [...results];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const result = queue.shift();
      if (result instanceof Error) throw result;
      if (!result) throw new Error(`Unexpected database query: ${sql}`);
      return result;
    },
  };
}

async function withServer(database, run, { adminAccess = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    req.user = adminAccess ? admin : employee;
    next();
  });
  app.use('/api/me', createMeRouter(database));
  app.use('/api/admin/workforce', createAdminWorkforceRouter(database));
  app.use(createErrorHandler(database));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function geolocation(overrides = {}) {
  return {
    latitude: 19.076,
    longitude: 72.8777,
    accuracy: 25,
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('attendance rejects missing or inaccurate geolocation before database work', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    for (const body of [
      { type: 'in' },
      { type: 'in', geolocation: geolocation({ accuracy: 101 }) },
      { type: 'in', geolocation: geolocation({ capturedAt: new Date(Date.now() - 600_000).toISOString() }) },
    ]) {
      const response = await fetch(`${baseUrl}/api/me/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }

    assert.equal(database.calls.length, 0);
  });
});

test('punch-in stores server business date and validated coordinates', async () => {
  const capturedAt = new Date().toISOString();
  const punch = {
    id: 1,
    punch_type: 'in',
    occurred_at: new Date(),
    work_date: '2026-11-28',
    latitude: 19.076,
    longitude: 72.8777,
    accuracy_m: 25,
    client_captured_at: new Date(capturedAt),
  };
  const database = createMockDatabase([[[]], [{ insertId: 1 }], [[punch]], [{}]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me/attendance/punch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'in', geolocation: geolocation({ capturedAt }) }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.latitude, 19.076);
    assert.equal(body.data.accuracyM, 25);
    assert.match(body.businessDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(database.calls[1].sql, /INSERT INTO attendance_punches/);
    const mysqlCapturedAt = new Date(capturedAt).toISOString().slice(0, 23).replace('T', ' ');
    assert.deepEqual(database.calls[1].params.slice(1, 7), ['in', body.businessDate, 19.076, 72.8777, 25, mysqlCapturedAt]);
    assert.equal(database.calls[3].params[3], 'attendance.punched_in');
  });
});

test('duplicate punch-in and punch-out without punch-in return conflicts', async () => {
  const cases = [
    { type: 'in', rows: [{ punch_type: 'in', occurred_at: new Date() }], message: /already punched in/i },
    { type: 'out', rows: [], message: /Punch in before punching out/i },
  ];

  for (const item of cases) {
    const database = createMockDatabase([[item.rows]]);
    await withServer(database, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/me/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, geolocation: geolocation() }),
      });

      assert.equal(response.status, 409);
      assert.match((await response.json()).error, item.message);
      assert.equal(database.calls.length, 1);
    });
  }
});

test('leave requests use inclusive calendar days and are audited', async () => {
  const database = createMockDatabase([[[]], [{ insertId: 3 }], [[leave]], [{}]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        reason: leave.reason,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.dayCount, 3);
    assert.deepEqual(database.calls[1].params, [7, 'casual', '2026-12-01', '2026-12-03', 3, 'Family event']);
    assert.equal(database.calls[3].params[3], 'leave.requested');
  });
});

test('overlapping pending or approved leave requests are rejected', async () => {
  const database = createMockDatabase([[[{ id: 2 }]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveType: leave.leave_type,
        startDate: '2026-12-02',
        endDate: '2026-12-04',
        reason: 'Another event',
      }),
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /pending or approved leave/);
    assert.equal(database.calls.some((call) => /INSERT INTO leave_requests/.test(call.sql)), false);
  });
});

test('administrators approve leave and record the decision', async () => {
  const approved = { ...leave, status: 'approved', decided_by: admin.id, decided_at: new Date() };
  const database = createMockDatabase([[[leave]], [{}], [[approved]], [{}]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/workforce/leave/3/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', comment: 'Approved.' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'approved');
    assert.deepEqual(database.calls[1].params, ['approved', admin.id, 'Approved.', 3]);
    assert.equal(database.calls[3].params[3], 'leave.approved');
  }, { adminAccess: true });
});

test('rejecting leave requires a comment before database work', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/workforce/leave/3/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected' }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /comment is required/i);
    assert.equal(database.calls.length, 0);
  }, { adminAccess: true });
});

test('administrators can inspect attendance within a validated date range', async () => {
  const database = createMockDatabase([[[{
    id: 1,
    employee_id: 7,
    employee_name: employee.name,
    employee_email: employee.email,
    punch_type: 'in',
    occurred_at: new Date('2026-11-28T02:00:00Z'),
    work_date: '2026-11-28',
    latitude: 19.076,
    longitude: 72.8777,
    accuracy_m: 25,
    client_captured_at: new Date('2026-11-28T02:00:00Z'),
  }]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/workforce/attendance?date=2026-11-28&employeeId=7`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data[0].employeeName, employee.name);
    assert.deepEqual(database.calls[0].params, ['2026-11-28', '2026-11-28', 7]);
  }, { adminAccess: true });
});
