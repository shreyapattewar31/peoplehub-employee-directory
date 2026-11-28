import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRateLimiters } from '../src/middleware/rateLimiters.js';

function createMockDatabase(results) {
  const calls = [];
  const queue = [...results];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const result = queue.shift();

      if (!result) {
        throw new Error(`Unexpected database query: ${sql}`);
      }

      return result;
    },
  };
}

async function withServer(database, run, user = null) {
  const authMiddleware = (req, res, next) => {
    if (!user) {
      return res.status(401).json({ error: 'Please sign in to continue.' });
    }

    req.user = user;
    return next();
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

const admin = { id: 1, name: 'Test Admin', email: 'admin@example.com', role: 'admin' };
const member = { id: 2, name: 'Team Member', email: 'member@example.com', role: 'user' };

test('audit log requires authentication', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-logs`);

    assert.equal(response.status, 401);
    assert.equal(database.calls.length, 0);
  });
});

test('audit log rejects non-admin accounts', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-logs`);

    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /Administrator access/);
    assert.equal(database.calls.length, 0);
  }, member);
});

test('audit log supports filters and pagination with parameterized queries', async () => {
  const database = createMockDatabase([
    [[{ total: 11 }]],
    [[{
      id: 11,
      user_id: 1,
      user_name: 'Test Admin',
      user_email: 'admin@example.com',
      action: 'employee.updated',
      entity_type: 'employee',
      entity_id: 7,
      summary: 'Updated Avery Morgan: designation.',
      details: JSON.stringify({ changes: [{ field: 'designation' }] }),
      ip_address: '127.0.0.1',
      created_at: '2026-11-26 10:00:00',
    }]],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/audit-logs?page=2&limit=5&action=employee.updated&entityType=employee&search=Avery`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.pagination.page, 2);
    assert.equal(body.pagination.totalPages, 3);
    assert.equal(body.data[0].details.changes[0].field, 'designation');
    assert.deepEqual(database.calls[0].params, ['employee.updated', 'employee', '%Avery%', '%Avery%', '%Avery%']);
    assert.deepEqual(database.calls[1].params.slice(-2), [5, 5]);
    assert.match(database.calls[1].sql, /ORDER BY id DESC/);
    assert.match(database.calls[1].sql, /LIMIT \? OFFSET \?/);
  }, admin);
});

test('audit log rejects unsupported filters', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-logs?action=employee.destroyed`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.action);
    assert.equal(database.calls.length, 0);
  }, admin);
});
