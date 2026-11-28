import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createOnboardingApplicationsRouter } from '../src/routes/onboardingApplications.js';
import { createOnboardingReviewRouter } from '../src/routes/onboardingReview.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const admin = { id: 1, name: 'Test Admin', email: 'admin@example.com', role: 'admin' };
const profile = {
  name: 'Jordan Lee',
  email: 'jordan@example.com',
  phone: '+1 (415) 555-0132',
  department: 'Engineering',
  designation: 'Engineer',
  salary: 0,
  joining_date: '2026-11-01',
};
const draft = {
  id: applicationId,
  email: profile.email,
  profile,
  status: 'draft',
  user_id: null,
  employee_id: null,
  submitted_at: null,
  expires_at: new Date(Date.now() + 60_000),
};
const submitted = {
  ...draft,
  status: 'submitted',
  user_id: 4,
  employee_id: 7,
  user_record_id: 4,
  account_status: 'pending',
  employee_name: profile.name,
  onboarding_status: 'pending',
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

function documentRows(status = 'pending') {
  return [
    { id: 11, document_type: 'aadhaar', asset_format: 'pdf', bytes: 1200, version_id: 'v1', verification_status: status, rejection_reason: '', verified_at: null },
    { id: 12, document_type: 'pan', asset_format: 'jpg', bytes: 900, version_id: 'v2', verification_status: status, rejection_reason: '', verified_at: null },
    { id: 13, document_type: 'bank_book', asset_format: 'png', bytes: 800, version_id: 'v3', verification_status: status, rejection_reason: '', verified_at: null },
  ];
}

async function withServer(database, run, { review = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  if (review) {
    app.use((req, res, next) => {
      req.user = admin;
      next();
    });
    app.use('/api/admin/onboarding', createOnboardingReviewRouter(database, {
      documentService: { downloadUrl: () => 'https://documents.example.test/private' },
    }));
  } else {
    app.use('/api/onboarding', createOnboardingApplicationsRouter(database, {
      documentService: {
        createUpload: () => ({ publicId: 'peoplehub/private/opaque', resourceType: 'image', format: 'pdf' }),
        destroy: async () => {},
        verifyUpload: async () => ({ bytes: 1200, versionId: 'v1', format: 'pdf' }),
      },
    }));
  }

  app.use(createErrorHandler(database));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0];
}

async function createDraft(baseUrl) {
  const response = await fetch(`${baseUrl}/api/onboarding/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
  assert.equal(response.status, 201);
  return { body: await response.json(), cookie: sessionCookie(response), setCookie: response.headers.get('set-cookie') };
}

test('direct onboarding creates a cookie-protected draft without a public identifier', async () => {
  const database = createMockDatabase([[[admin]], [{}]]);

  await withServer(database, async (baseUrl) => {
    const { body, cookie, setCookie } = await createDraft(baseUrl);
    const token = cookie.split('=')[1];

    assert.equal(body.data.status, 'draft');
    assert.match(body.data.applicationId, /^[a-f0-9-]{36}$/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.notEqual(token, body.data.applicationId);
    assert.equal(database.calls[1].params[1], createHash('sha256').update(token).digest('hex'));
    assert.equal(database.calls.some((call) => /INSERT INTO users|INSERT INTO sessions/.test(call.sql)), false);
  });
});

test('direct onboarding cannot load a draft without its HttpOnly cookie', async () => {
  const database = createMockDatabase([]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/onboarding/applications/${applicationId}`);
    assert.equal(response.status, 404);
    assert.equal(database.calls.length, 0);
  });
});

test('direct onboarding requires all three documents before submission', async () => {
  const database = createMockDatabase([
    [[admin]],
    [{}],
    [[draft]],
    [[draft]],
    [[{ document_type: 'aadhaar', bytes: 1200 }]],
  ]);

  await withServer(database, async (baseUrl) => {
    const { cookie } = await createDraft(baseUrl);
    const response = await fetch(`${baseUrl}/api/onboarding/applications/${applicationId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ password: 'Directory123', confirmPassword: 'Directory123' }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Upload Aadhaar, PAN, and bank-book/);
    assert.equal(database.calls.some((call) => /INSERT INTO users|INSERT INTO employees/.test(call.sql)), false);
  });
});

test('submitted onboarding creates a pending employee account but no session', async () => {
  const database = createMockDatabase([
    [[admin]],
    [{}],
    [[draft]],
    [[draft]],
    [documentRows().map(({ document_type, bytes }) => ({ document_type, bytes }))],
    [[]],
    [[]],
    [{ insertId: 7 }],
    [{ insertId: 4 }],
    [{}],
    [{}],
    [{}],
  ]);

  await withServer(database, async (baseUrl) => {
    const { cookie } = await createDraft(baseUrl);
    const response = await fetch(`${baseUrl}/api/onboarding/applications/${applicationId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ password: 'Directory123', confirmPassword: 'Directory123' }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.status, 'submitted');
    assert.equal(sessionCookie(response), 'peoplehub_onboarding=');
    const employeeInsert = database.calls.find((call) => /INSERT INTO employees/.test(call.sql));
    const userInsert = database.calls.find((call) => /INSERT INTO users/.test(call.sql));
    assert.match(employeeInsert.sql, /'pending'/);
    assert.match(userInsert.sql, /'user', \?, 'pending'/);
    assert.notEqual(userInsert.params[2], 'Directory123');
    assert.equal(database.calls.some((call) => /INSERT INTO sessions/.test(call.sql)), false);
  });
});

test('administrator application detail returns API-relative document paths', async () => {
  const database = createMockDatabase([
    [[submitted]],
    [documentRows()],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/onboarding/applications/${applicationId}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(
      body.data.documents[0].downloadPath,
      `/admin/onboarding/applications/${applicationId}/documents/aadhaar/download`,
    );
  }, { review: true });
});

test('administrators can verify an uploaded onboarding document', async () => {
  const database = createMockDatabase([
    [[submitted]],
    [[{ id: 11, bytes: 1200 }]],
    [{}],
    [{}],
    [documentRows('verified')],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/onboarding/applications/${applicationId}/documents/aadhaar/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'verified' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.documents[0].verificationStatus, 'verified');
    assert.deepEqual(database.calls[2].params, ['verified', admin.id, null, 11]);
    assert.equal(database.calls[3].params[3], 'onboarding.document_verified');
  }, { review: true });
});

test('administrator approval is blocked until every required document is verified', async () => {
  const database = createMockDatabase([
    [[submitted]],
    [documentRows()],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/onboarding/applications/${applicationId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Verify all documents/);
    assert.equal(database.calls.some((call) => /UPDATE users|UPDATE employees/.test(call.sql)), false);
  }, { review: true });
});

test('administrator approval activates the linked employee account', async () => {
  const database = createMockDatabase([
    [[submitted]],
    [documentRows('verified')],
    [{}],
    [{}],
    [{}],
    [documentRows('verified')],
  ]);

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/onboarding/applications/${applicationId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', comment: 'Documents verified.' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.message, /can now sign in/i);
    assert.deepEqual(database.calls[2].params, ['approved', 7]);
    assert.deepEqual(database.calls[3].params, ['active', 4]);
    assert.equal(database.calls[4].params[3], 'onboarding.approved');
  }, { review: true });
});
