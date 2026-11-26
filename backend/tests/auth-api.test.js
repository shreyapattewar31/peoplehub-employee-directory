import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { hashPassword, SESSION_COOKIE_NAME } from '../src/auth.js';

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

async function withServer(database, run) {
  const server = createApp(database).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0];
}

test('employee API rejects requests without a session', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.match(body.error, /sign in/i);
    assert.equal(database.calls.length, 0);
  });
});

test('registration validates input before querying the database', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A', email: 'invalid', password: 'short' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.name);
    assert.ok(body.errors.email);
    assert.ok(body.errors.password);
    assert.equal(database.calls.length, 0);
  });
});

test('registration hashes the password and creates an HttpOnly session', async () => {
  const database = createMockDatabase([
    [[]],
    [[{ total: 0 }]],
    [{ insertId: 4 }],
    [{}],
    [{ affectedRows: 0 }],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Avery Morgan',
        email: 'Avery@Example.com',
        password: 'Directory123',
      }),
    });
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie');
    const storedHash = database.calls[2].params[2];

    assert.equal(response.status, 201);
    assert.equal(body.data.email, 'avery@example.com');
    assert.equal(body.data.role, 'admin');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.notEqual(storedHash, 'Directory123');
    assert.equal(await bcrypt.compare('Directory123', storedHash), true);
    assert.match(database.calls[3].sql, /INSERT INTO sessions/);
    assert.match(database.calls[5].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[5].params[3], 'account.registered');
  });
});

test('later registrations receive read-only member access', async () => {
  const database = createMockDatabase([
    [[]],
    [[{ total: 1 }]],
    [{ insertId: 5 }],
    [{}],
    [{ affectedRows: 0 }],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jordan Lee',
        email: 'jordan@example.com',
        password: 'Directory123',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.role, 'user');
    assert.equal(database.calls[2].params[3], 'user');
  });
});

test('registration rejects an existing email', async () => {
  const database = createMockDatabase([[[{ id: 1 }]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Avery Morgan',
        email: 'avery@example.com',
        password: 'Directory123',
      }),
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already exists/);
    assert.equal(database.calls.length, 1);
  });
});

test('login creates a session for valid credentials', async () => {
  const passwordHash = await hashPassword('Directory123');
  const database = createMockDatabase([
    [[{
      id: 4,
      name: 'Avery Morgan',
      email: 'avery@example.com',
      password_hash: passwordHash,
      role: 'admin',
      created_at: '2026-11-26 10:00:00',
    }]],
    [{}],
    [{ affectedRows: 0 }],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'AVERY@example.com', password: 'Directory123' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.name, 'Avery Morgan');
    assert.equal(body.data.role, 'admin');
    assert.equal(body.data.password_hash, undefined);
    assert.ok(sessionCookie(response)?.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.match(database.calls[3].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[3].params[3], 'auth.login');
  });
});

test('login returns a generic error for invalid credentials', async () => {
  const database = createMockDatabase([[[]]]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'avery@example.com', password: 'WrongPassword1' }),
    });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Email or password is incorrect.');
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('current user requires a valid session', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    assert.equal(response.status, 401);
    assert.equal(database.calls.length, 0);
  });
});

test('current user is returned for a valid session cookie', async () => {
  const token = 'valid-session-token';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const database = createMockDatabase([
    [[{
      id: 4,
      name: 'Avery Morgan',
      email: 'avery@example.com',
      role: 'admin',
      created_at: '2026-11-26 10:00:00',
      expires_at: '2026-12-03 10:00:00',
    }]],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.email, 'avery@example.com');
    assert.equal(body.data.role, 'admin');
    assert.deepEqual(database.calls[0].params, [tokenHash]);
  });
});

test('logout deletes the session, records activity, and clears the cookie', async () => {
  const database = createMockDatabase([
    [[{
      id: 4,
      name: 'Avery Morgan',
      email: 'avery@example.com',
      role: 'admin',
      created_at: '2026-11-26 10:00:00',
      expires_at: '2026-12-03 10:00:00',
    }]],
    [{ affectedRows: 1 }],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=session-token` },
    });

    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
    assert.match(database.calls[1].sql, /DELETE FROM sessions/);
    assert.match(database.calls[2].sql, /INSERT INTO audit_logs/);
    assert.equal(database.calls[2].params[3], 'auth.logout');
  });
});
