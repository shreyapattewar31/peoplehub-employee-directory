import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRateLimiters } from '../src/middleware/rateLimiters.js';

const admin = { id: 1, name: 'Test Admin', email: 'admin@example.com', role: 'admin' };

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

async function withServer(database, run, { user = admin, emailSender } = {}) {
  const server = createApp(database, {
    authMiddleware: (req, res, next) => {
      req.user = user;
      next();
    },
    turnstileMiddleware: (req, res, next) => next(),
    rateLimiters: createRateLimiters({ enabled: false }),
    emailSender,
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('admin settings return display preferences and non-secret integration status', async () => {
  const database = createMockDatabase([[[
    { setting_key: 'admin.timezone', setting_value: 'Asia/Kolkata' },
    { setting_key: 'admin.date_format', setting_value: 'iso' },
    { setting_key: 'admin.time_format', setting_value: '24h' },
  ]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/settings`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.timezone, 'Asia/Kolkata');
    assert.equal(body.data.dateFormat, 'iso');
    assert.equal(body.data.timeFormat, '24h');
    assert.equal(body.data.turnstileEnabled, true);
    assert.equal(body.data.smtp?.password, undefined);
    assert.equal(body.data.turnstileSecret, undefined);
  });
});

test('admin settings reject an invalid time zone before writing', async () => {
  const database = createMockDatabase();

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: 'Not/AZone', dateFormat: 'short', timeFormat: '12h' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.timezone);
    assert.equal(database.calls.length, 0);
  });
});

test('admin settings save all preferences and record an audit event', async () => {
  const stored = [
    { setting_key: 'admin.timezone', setting_value: 'UTC' },
    { setting_key: 'admin.date_format', setting_value: 'dayFirst' },
    { setting_key: 'admin.time_format', setting_value: '24h' },
  ];
  const database = createMockDatabase([{}, {}, {}, [stored], [{}]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: 'UTC', dateFormat: 'dayFirst', timeFormat: '24h' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.dateFormat, 'dayFirst');
    assert.equal(database.calls.length, 5);
    assert.equal(database.calls[4].params[3], 'settings.updated');
  });
});

test('email test uses the configured sender and audits the recipient', async () => {
  let sent;
  const database = createMockDatabase([[{}]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/email/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'ADMIN@Example.com' }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.to, 'admin@example.com');
    assert.equal(sent.to, 'admin@example.com');
    assert.match(sent.subject, /email configuration test/i);
    assert.equal(database.calls[0].params[3], 'email.sent');
  }, {
    emailSender: async (message) => { sent = message; },
  });
});

test('system logs support filtering and serialize timestamps', async () => {
  const database = createMockDatabase([[[
    { id: 3, level: 'error', event: 'http.unhandled_error', message: 'Example failure', context: '{"code":"TEST"}', user_id: 1, ip_address: '127.0.0.1', created_at: '2026-11-26 10:00:00' },
  ]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/logs?level=error&limit=25`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data[0].context.code, 'TEST');
    assert.equal(body.data[0].created_at, '2026-11-26T10:00:00.000Z');
    assert.deepEqual(database.calls[0].params, ['error', 25]);
  });
});

test('employee JSON backup excludes private paths and credentials', async () => {
  const database = createMockDatabase([
    [[{
      id: 7,
      name: 'Avery Morgan',
      email: 'avery@example.com',
      phone: '4155550132',
      department: 'Engineering',
      designation: 'Engineer',
      salary: 95000,
      joining_date: '2026-11-01',
      created_at: '2026-11-24 10:00:00',
      updated_at: '2026-11-24 10:00:00',
      photo_path: 'private.webp',
      password_hash: 'never-export',
    }]],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/backup?dataset=employees&format=json`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    assert.equal(body.data.employees[0].has_photo, true);
    assert.equal(body.data.employees[0].photo_path, undefined);
    assert.equal(serialized.includes('never-export'), false);
    assert.equal(serialized.includes('private.webp'), false);
    assert.equal(database.calls[1].params[3], 'data.exported');
  });
});

test('employee CSV backup quotes values and includes a UTF-8 BOM', async () => {
  const database = createMockDatabase([
    [[{ id: 7, name: 'Morgan, Avery', email: 'avery@example.com', phone: '4155550132', department: 'Engineering', designation: 'Engineer', salary: 95000, joining_date: '2026-11-01', created_at: '2026-11-24 10:00:00', updated_at: '2026-11-24 10:00:00', photo_path: null }]],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/backup?dataset=employees&format=csv`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.deepEqual([...bytes.slice(0, 3)], [0xEF, 0xBB, 0xBF]);
    assert.match(text, /"Morgan, Avery"/);
  });
});

test('full backup rejects CSV and non-admin accounts cannot access administration', async () => {
  const database = createMockDatabase();

  await withServer(database, async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/admin/backup?dataset=all&format=csv`);
    assert.equal(invalid.status, 400);
    assert.equal(database.calls.length, 0);
  });

  await withServer(createMockDatabase(), async (baseUrl) => {
    for (const path of ['/api/admin/settings', '/api/admin/logs', '/api/admin/backup']) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 403);
    }
  }, { user: { ...admin, role: 'user' } });
});
