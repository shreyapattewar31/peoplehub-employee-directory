import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { auditedTransaction } from '../audit.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateEmployee } from '../validation.js';
import { EMPLOYEE_COLUMNS, serializeEmployee } from '../utils/employees.js';
import { normalizeGoogleFormUrl } from '../utils/url.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const TOKEN_KEY = 'google_forms_webhook_token';
const FORM_URL_KEY = 'google_form_url';
const FORM_FIELDS = [
  { key: 'name', label: 'Name', type: 'Short answer', required: true },
  { key: 'email', label: 'Email', type: 'Short answer', required: true },
  { key: 'phone', label: 'Phone', type: 'Short answer', required: true },
  { key: 'department', label: 'Department', type: 'Short answer', required: true },
  { key: 'designation', label: 'Designation', type: 'Short answer', required: true },
  { key: 'salary', label: 'Salary', type: 'Short answer', required: true },
  { key: 'joining_date', label: 'Joining date', type: 'Date', required: true },
];

function tokensMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

async function getWebhookToken(database) {
  const [rows] = await database.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?',
    [TOKEN_KEY],
  );

  if (rows[0]) {
    return rows[0].setting_value;
  }

  const token = randomBytes(32).toString('base64url');

  try {
    await database.query(
      'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
      [TOKEN_KEY, token],
    );
    return token;
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') {
      throw error;
    }

    const [existingRows] = await database.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      [TOKEN_KEY],
    );
    return existingRows[0]?.setting_value;
  }
}

async function findEmployee(database, id) {
  const [rows] = await database.query(
    `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

async function getFormUrl(database) {
  const [rows] = await database.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?',
    [FORM_URL_KEY],
  );
  return rows[0]?.setting_value || '';
}

export function createOnboardingRouter(database = pool, authenticate, {
  submissionLimiter = (req, res, next) => next(),
  mutationLimiter = (req, res, next) => next(),
  turnstileMiddleware = (req, res, next) => next(),
} = {}) {
  const router = Router();

  router.get('/config', authenticate, requireAdmin, asyncHandler(async (req, res) => {
    const token = await getWebhookToken(database);
    const formUrl = await getFormUrl(database);
    res.json({
      data: {
        token,
        formUrl,
        webhookPath: '/onboarding/submissions',
        fields: FORM_FIELDS,
      },
    });
  }));

  router.post('/form-link', mutationLimiter, turnstileMiddleware, authenticate, requireAdmin, asyncHandler(async (req, res) => {
    const formUrl = normalizeGoogleFormUrl(req.body?.url);
    if (!formUrl) {
      return res.status(400).json({
        error: 'Validation failed.',
        errors: { url: 'Paste a valid https://docs.google.com/forms/ or https://forms.gle/ link.' },
      });
    }

    await auditedTransaction(
      database,
      req.user,
      {
        action: 'onboarding.form_link_saved',
        entityType: 'system',
        summary: 'Saved the employee Google Form link.',
        details: { url: formUrl },
        ipAddress: req.ip,
      },
      async (connection) => {
        await connection.query(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [FORM_URL_KEY, formUrl],
        );
        return { formUrl };
      },
    );

    res.json({ data: { formUrl } });
  }));

  router.post('/submissions', submissionLimiter, asyncHandler(async (req, res) => {
    const expectedToken = await getWebhookToken(database);
    const authorization = req.get('authorization') || '';
    const providedToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';

    if (!tokensMatch(providedToken, expectedToken)) {
      return res.status(401).json({ error: 'Invalid onboarding webhook token.' });
    }

    const responseId = typeof req.body?.responseId === 'string'
      ? req.body.responseId.trim()
      : '';

    if (!responseId || responseId.length > 190) {
      return res.status(400).json({
        error: 'A valid Google Form response ID is required.',
        errors: { responseId: 'Response ID must be between 1 and 190 characters.' },
      });
    }

    const { errors, value } = validateEmployee(req.body?.employee);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const [adminRows] = await database.query(
      "SELECT id, name, email FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1",
    );
    const admin = adminRows[0];

    if (!admin) {
      return res.status(409).json({
        error: 'An administrator account is required before form submissions can be imported.',
      });
    }

    let result;

    try {
      result = await auditedTransaction(
        database,
        admin,
        (outcome) => outcome.duplicate ? null : {
          action: 'employee.created',
          entityType: 'employee',
          entityId: outcome.employee.id,
          summary: `Added employee ${outcome.employee.name} from Google Forms.`,
          details: { source: 'google_form', responseId },
          ipAddress: req.ip,
        },
        async (connection) => {
          const [existingRows] = await connection.query(
            'SELECT employee_id FROM onboarding_submissions WHERE response_id = ? FOR UPDATE',
            [responseId],
          );
          const existing = existingRows[0];

          if (existing) {
            return {
              duplicate: true,
              employee: existing.employee_id
                ? await findEmployee(connection, existing.employee_id)
                : null,
            };
          }

          const [insertResult] = await connection.query(
            `INSERT INTO employees
              (name, email, phone, department, designation, salary, joining_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              value.name,
              value.email,
              value.phone,
              value.department,
              value.designation,
              value.salary,
              value.joining_date,
            ],
          );
          const employee = await findEmployee(connection, insertResult.insertId);

          await connection.query(
            `INSERT INTO onboarding_submissions
              (response_id, employee_id, employee_email)
             VALUES (?, ?, ?)`,
            [responseId, employee.id, employee.email],
          );

          return { duplicate: false, employee };
        },
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'An employee with this email address already exists.',
          errors: { email: 'An employee with this email address already exists.' },
        });
      }
      throw error;
    }

    return res.status(result.duplicate ? 200 : 201).json({
      data: serializeEmployee(result.employee),
      duplicate: result.duplicate,
      ...(result.employee
        ? {}
        : { message: 'This form response was already processed and its employee record was removed.' }),
    });
  }));

  return router;
}
