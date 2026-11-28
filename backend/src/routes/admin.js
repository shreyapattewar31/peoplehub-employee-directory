import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { auditedTransaction, recordAudit } from '../audit.js';
import { sendMail, isSmtpConfigured } from '../services/mail.js';
import { IMAGE_POLICY } from '../services/employeePhotos.js';
import { toUtcIso } from '../utils/time.js';
import { isTurnstileConfigured } from '../turnstile.js';
import { recordSystemLog } from '../logger.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const SETTING_KEYS = {
  timezone: 'admin.timezone',
  dateFormat: 'admin.date_format',
  timeFormat: 'admin.time_format',
};

const DEFAULT_SETTINGS = {
  timezone: config.appTimeZone,
  dateFormat: 'short',
  timeFormat: '12h',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseJson(value) {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getSettings(database) {
  const [rows] = await database.query(
    `SELECT setting_key, setting_value FROM app_settings
     WHERE setting_key IN (?, ?, ?)`,
    Object.values(SETTING_KEYS),
  );
  const stored = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));

  return {
    timezone: stored[SETTING_KEYS.timezone] || DEFAULT_SETTINGS.timezone,
    dateFormat: stored[SETTING_KEYS.dateFormat] || DEFAULT_SETTINGS.dateFormat,
    timeFormat: stored[SETTING_KEYS.timeFormat] || DEFAULT_SETTINGS.timeFormat,
  };
}

function validateSettings(input) {
  const errors = {};
  const value = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: { form: 'Settings must be provided as an object.' }, value };
  }

  const timezone = String(input.timezone || '').trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    value.timezone = timezone;
  } catch {
    errors.timezone = 'Choose a valid IANA time zone.';
  }

  if (!['short', 'numeric', 'dayFirst', 'iso'].includes(input.dateFormat)) {
    errors.dateFormat = 'Choose a supported date format.';
  } else {
    value.dateFormat = input.dateFormat;
  }

  if (!['12h', '24h'].includes(input.timeFormat)) {
    errors.timeFormat = 'Choose 12-hour or 24-hour time.';
  } else {
    value.timeFormat = input.timeFormat;
  }

  return { errors, value };
}

function serializeLog(row) {
  return {
    ...row,
    context: parseJson(row.context),
    created_at: toUtcIso(row.created_at),
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => {
    const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
    return csvCell(value);
  }).join(','));
  return [header, ...body].join('\r\n');
}

const EMPLOYEE_CSV_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'salary', label: 'Salary' },
  { key: 'joining_date', label: 'Joining date' },
  { key: 'created_at', label: 'Created at' },
  { key: 'updated_at', label: 'Updated at' },
];

const AUDIT_CSV_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'created_at', label: 'Created at' },
  { key: 'action', label: 'Action' },
  { key: 'entity_type', label: 'Entity type' },
  { key: 'entity_id', label: 'Entity ID' },
  { key: 'user_name', label: 'Actor' },
  { key: 'user_email', label: 'Actor email' },
  { key: 'summary', label: 'Summary' },
  { key: 'ip_address', label: 'IP address' },
  { key: 'details', label: 'Details', value: (row) => JSON.stringify(row.details ?? {}) },
];

async function auditExport(database, req, dataset, format) {
  try {
    await recordAudit(database, {
      user: req.user,
      action: 'data.exported',
      entityType: 'system',
      summary: `Exported ${dataset} data as ${format.toUpperCase()}.`,
      details: { dataset, format },
      ipAddress: req.ip,
    });
  } catch (error) {
    await recordSystemLog(database, {
      level: 'error',
      event: 'export.audit_failed',
      message: error.message,
      userId: req.user.id,
      ipAddress: req.ip,
    });
  }
}

export function createAdminRouter(database = pool, {
  turnstileMiddleware,
  mutationLimiter,
  exportLimiter,
  emailSender = sendMail,
} = {}) {
  const router = Router();
  const verifyTurnstile = turnstileMiddleware || ((req, res, next) => next());
  const limitMutations = mutationLimiter || ((req, res, next) => next());
  const limitExports = exportLimiter || ((req, res, next) => next());

  router.get('/settings', asyncHandler(async (req, res) => {
    const settings = await getSettings(database);
    res.json({
      data: {
        ...settings,
        smtpConfigured: isSmtpConfigured(),
        turnstileEnabled: isTurnstileConfigured(),
        imagePolicy: IMAGE_POLICY,
        publicAppUrl: config.publicAppUrl.replace(/\/+$/, ''),
        environmentTimeZone: config.appTimeZone,
      },
    });
  }));

  router.put('/settings', limitMutations, verifyTurnstile, asyncHandler(async (req, res) => {
    const { errors, value } = validateSettings(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const settings = await auditedTransaction(
      database,
      req.user,
      {
        action: 'settings.updated',
        entityType: 'system',
        summary: 'Updated display time zone and date/time formats.',
        details: value,
        ipAddress: req.ip,
      },
      async (connection) => {
        for (const [key, settingKey] of Object.entries(SETTING_KEYS)) {
          await connection.query(
            `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
            [settingKey, value[key]],
          );
        }

        return getSettings(connection);
      },
    );

    res.json({ data: settings });
  }));

  router.post('/email/test', limitMutations, verifyTurnstile, asyncHandler(async (req, res) => {
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(to) || to.length > 255) {
      return res.status(400).json({
        error: 'Validation failed.',
        errors: { to: 'Enter a valid email address.' },
      });
    }

    await emailSender({
      to,
      subject: 'PeopleHub email configuration test',
      text: 'This is a test email from PeopleHub. Your SMTP configuration is working.',
    });

    try {
      await recordAudit(database, {
        user: req.user,
        action: 'email.sent',
        entityType: 'system',
        summary: `Sent a configuration test email to ${to}.`,
        details: { recipient: to },
        ipAddress: req.ip,
      });
    } catch (error) {
      await recordSystemLog(database, {
        level: 'error',
        event: 'email.audit_failed',
        message: error.message,
        userId: req.user.id,
        ipAddress: req.ip,
      });
    }

    res.json({ data: { sent: true, to } });
  }));

  router.get('/logs', limitExports, asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const level = String(req.query.level || '').trim();
    const conditions = [];
    const params = [];

    if (['error', 'warn', 'info'].includes(level)) {
      conditions.push('level = ?');
      params.push(level);
    }

    const [rows] = await database.query(
      `SELECT id, level, event, message, context, user_id, ip_address, created_at
       FROM system_logs
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit],
    );

    res.json({ data: rows.map(serializeLog) });
  }));

  router.get('/backup', limitExports, asyncHandler(async (req, res) => {
    const dataset = String(req.query.dataset || 'all');
    const format = String(req.query.format || 'json').toLowerCase();

    if (!['employees', 'audit', 'logs', 'all'].includes(dataset)) {
      return res.status(400).json({ error: 'Choose a valid backup dataset.' });
    }

    if (!['json', 'csv'].includes(format) || (dataset === 'all' && format !== 'json')) {
      return res.status(400).json({ error: 'CSV exports require employees, audit, or logs; the full backup uses JSON.' });
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      timeZone: config.appTimeZone,
      dataset,
      data: {},
    };
    let csvRows;
    let csvColumns;

    if (dataset === 'employees' || dataset === 'all') {
      const [rows] = await database.query(
        `SELECT id, name, email, phone, department, designation, salary, joining_date,
                created_at, updated_at, photo_path
         FROM employees
         ORDER BY id ASC
         LIMIT 10000`,
      );
      const employees = rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        department: row.department,
        designation: row.designation,
        salary: row.salary,
        joining_date: row.joining_date,
        created_at: toUtcIso(row.created_at),
        updated_at: toUtcIso(row.updated_at),
        has_photo: Boolean(row.photo_path),
      }));
      payload.data.employees = employees;
      csvRows = employees;
      csvColumns = EMPLOYEE_CSV_COLUMNS;
    }

    if (dataset === 'audit' || dataset === 'all') {
      const [rows] = await database.query(
        `SELECT id, user_id, user_name, user_email, action, entity_type, entity_id,
                summary, details, ip_address, created_at
         FROM audit_logs
         ORDER BY id ASC
         LIMIT 10000`,
      );
      const audit = rows.map((row) => ({ ...row, details: parseJson(row.details), created_at: toUtcIso(row.created_at) }));
      payload.data.auditLogs = audit;
      csvRows = audit;
      csvColumns = AUDIT_CSV_COLUMNS;
    }

    if (dataset === 'logs' || dataset === 'all') {
      const [rows] = await database.query(
        `SELECT id, level, event, message, context, user_id, ip_address, created_at
         FROM system_logs
         ORDER BY id ASC
         LIMIT 10000`,
      );
      const logs = rows.map(serializeLog);
      payload.data.systemLogs = logs;
      csvRows = logs;
      csvColumns = [
        { key: 'id', label: 'ID' },
        { key: 'created_at', label: 'Created at' },
        { key: 'level', label: 'Level' },
        { key: 'event', label: 'Event' },
        { key: 'message', label: 'Message' },
        { key: 'ip_address', label: 'IP address' },
        { key: 'context', label: 'Context', value: (row) => JSON.stringify(row.context ?? {}) },
      ];
    }

    await auditExport(database, req, dataset, format);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `peoplehub-${dataset}-${date}.${format}`;

    if (format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(`\uFEFF${toCsv(csvRows, csvColumns)}`);
    }

    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    return res.json(payload);
  }));

  return router;
}
