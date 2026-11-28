import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import {
  createTurnstileMiddleware,
  createTurnstileVerifier,
} from '../src/turnstile.js';
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

function siteverifyResponse(payload, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return payload;
    },
  };
}

async function withServer(database, turnstileMiddleware, run) {
  const server = createApp(database, {
    authMiddleware: (req, res, next) => {
      req.user = admin;
      next();
    },
    turnstileMiddleware,
    rateLimiters: createRateLimiters({ enabled: false }),
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Turnstile verifier posts the token and accepts an allowed hostname', async () => {
  let request;
  const verify = createTurnstileVerifier({
    secretKey: 'production-secret',
    allowedHostnames: ['peoplehub.example'],
    fetchImpl: async (url, options) => {
      request = { url, options };
      return siteverifyResponse({ success: true, hostname: 'peoplehub.example' });
    },
  });

  const result = await verify('valid-token', '203.0.113.10');

  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(request.options.body.get('secret'), 'production-secret');
  assert.equal(request.options.body.get('response'), 'valid-token');
  assert.equal(request.options.body.get('remoteip'), '203.0.113.10');
});

test('Turnstile verifier rejects a hostname mismatch', async () => {
  const verify = createTurnstileVerifier({
    secretKey: 'production-secret',
    allowedHostnames: ['peoplehub.example'],
    fetchImpl: async () => siteverifyResponse({ success: true, hostname: 'other.example' }),
  });

  assert.deepEqual(await verify('valid-token'), { ok: false, code: 'hostname' });
});

test('Turnstile verifier distinguishes expired tokens from invalid tokens', async () => {
  const responses = [
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
  ];
  const verify = createTurnstileVerifier({
    secretKey: 'production-secret',
    allowedHostnames: [],
    fetchImpl: async () => siteverifyResponse(responses.shift()),
  });

  assert.deepEqual(await verify('invalid-token'), { ok: false, code: 'invalid' });
  assert.deepEqual(await verify('expired-token'), { ok: false, code: 'expired' });
});

test('Turnstile verifier fails closed when Siteverify is unavailable', async () => {
  const verifiers = [
    createTurnstileVerifier({
      secretKey: 'secret',
      allowedHostnames: [],
      fetchImpl: async () => { throw new Error('network failure'); },
    }),
    createTurnstileVerifier({
      secretKey: 'secret',
      allowedHostnames: [],
      fetchImpl: async () => siteverifyResponse({}, { ok: false }),
    }),
    createTurnstileVerifier({
      secretKey: 'secret',
      allowedHostnames: [],
      fetchImpl: async () => siteverifyResponse(null),
    }),
  ];

  for (const verify of verifiers) {
    await assert.rejects(verify('token'), /unavailable/i);
  }
});

test('protected forms reject a missing Turnstile token before database work', async () => {
  const database = createMockDatabase();
  let verificationCalls = 0;
  const verifier = createTurnstileVerifier({
    secretKey: 'secret',
    allowedHostnames: [],
    fetchImpl: async () => {
      verificationCalls += 1;
      return siteverifyResponse({ success: true });
    },
  });

  await withServer(database, createTurnstileMiddleware(verifier), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/1`, { method: 'DELETE' });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.errors.captcha, /Complete the security check/);
    assert.equal(verificationCalls, 0);
    assert.equal(database.calls.length, 0);
  });
});

test('protected forms reject an invalid Turnstile token before database work', async () => {
  const database = createMockDatabase();
  const verifier = createTurnstileVerifier({
    secretKey: 'secret',
    allowedHostnames: [],
    fetchImpl: async () => siteverifyResponse({ success: false, 'error-codes': ['invalid-input-response'] }),
  });

  await withServer(database, createTurnstileMiddleware(verifier), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/1`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'cf-turnstile-response': 'invalid-token' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.errors.captcha, /Complete the security check/);
    assert.equal(database.calls.length, 0);
  });
});

test('a valid Turnstile token allows a protected employee mutation', async () => {
  const employee = {
    id: 7,
    name: 'Avery Morgan',
    email: 'avery@example.com',
    phone: '+1 (415) 555-0132',
    department: 'Engineering',
    designation: 'Engineer',
    salary: 95000,
    joining_date: '2026-11-01',
    photo_path: null,
    created_at: '2026-11-24 10:00:00',
    updated_at: '2026-11-24 10:00:00',
  };
  const database = createMockDatabase([[[employee]], [{ affectedRows: 1 }], [{ affectedRows: 0 }], [{}]]);
  const verifier = createTurnstileVerifier({
    secretKey: 'secret',
    allowedHostnames: [],
    fetchImpl: async () => siteverifyResponse({ success: true }),
  });

  await withServer(database, createTurnstileMiddleware(verifier), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/7`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'cf-turnstile-response': 'valid-token' }),
    });

    assert.equal(response.status, 204);
    assert.equal(database.calls.length, 4);
    assert.match(database.calls[1].sql, /UPDATE employees[\s\S]*SET deleted_at = UTC_TIMESTAMP/);
    assert.match(database.calls[2].sql, /UPDATE users SET status = 'blocked'/);
  });
});

test('an expired Turnstile token asks the browser for a fresh check', async () => {
  const database = createMockDatabase();
  const verifier = createTurnstileVerifier({
    secretKey: 'secret',
    allowedHostnames: [],
    fetchImpl: async () => siteverifyResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
  });

  await withServer(database, createTurnstileMiddleware(verifier), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/1`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'cf-turnstile-response': 'expired-token' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.errors.captcha, /expired or was already used/i);
    assert.equal(database.calls.length, 0);
  });
});

test('Siteverify outages return a retryable error without mutating data', async () => {
  const database = createMockDatabase();
  const verifier = createTurnstileVerifier({
    secretKey: 'secret',
    allowedHostnames: [],
    fetchImpl: async () => { throw new Error('network failure'); },
  });

  await withServer(database, createTurnstileMiddleware(verifier), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/employees/1`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'cf-turnstile-response': 'valid-token' }),
    });
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.match(body.error, /temporarily unavailable/i);
    assert.equal(database.calls.length, 0);
  });
});
