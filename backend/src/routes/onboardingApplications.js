import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { auditedTransaction, recordAudit } from '../audit.js';
import { hashPassword } from '../auth.js';
import { validateRegistration } from '../authValidation.js';
import { validateEmployee } from '../validation.js';
import { cloudinaryDocuments } from '../services/cloudinary.js';

const ONBOARDING_COOKIE_NAME = 'peoplehub_onboarding';
const DOCUMENT_TYPES = ['aadhaar', 'pan', 'bank_book'];
const APPLICATION_ID_PATTERN = /^[a-f0-9-]{36}$/i;

const onboardingCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  path: '/api/onboarding',
};

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function hashOnboardingToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function parseProfile(profile) {
  if (profile && typeof profile === 'object') {
    return profile;
  }

  try {
    return JSON.parse(profile || '{}');
  } catch {
    return {};
  }
}

function serializeDocument(document) {
  if (!document) {
    return null;
  }

  return {
    documentType: document.document_type,
    format: document.asset_format,
    bytes: Number(document.bytes || 0),
    uploaded: Number(document.bytes || 0) > 0,
    verificationStatus: document.verification_status,
    rejectionReason: document.rejection_reason || '',
  };
}

async function getApplication(database, req, { forUpdate = false } = {}) {
  const token = req.cookies?.[ONBOARDING_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [rows] = await database.query(
    `SELECT id, email, profile, status, user_id, employee_id, submitted_at, expires_at
     FROM onboarding_applications
     WHERE token_hash = ? AND status = 'draft' AND expires_at > UTC_TIMESTAMP(6)
     ${forUpdate ? 'LIMIT 1 FOR UPDATE' : 'LIMIT 1'}`,
    [hashOnboardingToken(token)],
  );

  return rows[0] || null;
}

async function getDocuments(database, applicationId) {
  const [rows] = await database.query(
    `SELECT document_type, asset_format, bytes, verification_status, rejection_reason
     FROM onboarding_documents
     WHERE application_id = ?
     ORDER BY FIELD(document_type, 'aadhaar', 'pan', 'bank_book')`,
    [applicationId],
  );
  return rows.map(serializeDocument);
}

function validateProfile(input) {
  return validateEmployee({
    ...input,
    salary: input?.salary ?? 0,
  });
}

function cloudinaryErrorResponse(res, error) {
  if (error.code === 'CLOUDINARY_NOT_CONFIGURED') {
    return res.status(503).json({ error: 'Document uploads are temporarily unavailable.' });
  }

  if (error.code === 'INVALID_DOCUMENT') {
    return res.status(400).json({ error: error.message, errors: { document: error.message } });
  }

  if (error.code === 'DOCUMENT_VERIFICATION_FAILED') {
    return res.status(400).json({ error: error.message, errors: { document: error.message } });
  }

  return res.status(502).json({ error: 'The document service is temporarily unavailable. Please try again.' });
}

export function createOnboardingApplicationsRouter(database = pool, {
  submissionLimiter = (req, res, next) => next(),
  uploadLimiter = (req, res, next) => next(),
  turnstileMiddleware = (req, res, next) => next(),
  documentService = cloudinaryDocuments,
} = {}) {
  const router = Router();

  router.post('/applications', submissionLimiter, asyncHandler(async (req, res) => {
    const { errors, value } = validateProfile(req.body?.profile);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const [adminRows] = await database.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminRows.length === 0) {
      return res.status(409).json({ error: 'An administrator must create the first account before employee onboarding is available.' });
    }

    const applicationId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashOnboardingToken(token);

    await database.query(
      `INSERT INTO onboarding_applications
        (id, token_hash, email, profile, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${config.documents.draftTtlHours} HOUR))`,
      [applicationId, tokenHash, value.email, JSON.stringify(value)],
    );

    res.cookie(ONBOARDING_COOKIE_NAME, token, {
      ...onboardingCookieOptions,
      maxAge: config.documents.draftTtlHours * 60 * 60 * 1000,
    });

    return res.status(201).json({
      data: {
        applicationId,
        email: value.email,
        profile: value,
        status: 'draft',
        documents: [],
      },
    });
  }));

  router.get('/applications/:id', asyncHandler(async (req, res) => {
    if (!APPLICATION_ID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    const application = await getApplication(database, req);
    if (!application || application.id !== req.params.id) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    return res.json({
      data: {
        applicationId: application.id,
        email: application.email,
        profile: parseProfile(application.profile),
        status: application.status,
        documents: await getDocuments(database, application.id),
      },
    });
  }));

  router.patch('/applications/:id', submissionLimiter, asyncHandler(async (req, res) => {
    const application = await getApplication(database, req);
    if (!application || application.id !== req.params.id) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    const { errors, value } = validateProfile({
      ...parseProfile(application.profile),
      ...req.body?.profile,
    });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    await database.query(
      'UPDATE onboarding_applications SET email = ?, profile = ? WHERE id = ?',
      [value.email, JSON.stringify(value), application.id],
    );

    return res.json({ data: { applicationId: application.id, profile: value } });
  }));

  router.post('/applications/:id/documents/:type/sign', uploadLimiter, asyncHandler(async (req, res) => {
    const application = await getApplication(database, req);
    if (!application || application.id !== req.params.id) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    if (!DOCUMENT_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: 'Unsupported document type.' });
    }

    const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim().slice(0, 255) : '';

    try {
      const upload = documentService.createUpload({
        applicationId: application.id,
        documentType: req.params.type,
        filename,
      });

      const [existingRows] = await database.query(
        'SELECT public_id, resource_type, bytes FROM onboarding_documents WHERE application_id = ? AND document_type = ? FOR UPDATE',
        [application.id, req.params.type],
      );
      const previous = existingRows[0];

      if (previous?.bytes > 0) {
        await documentService.destroy({ publicId: previous.public_id, resourceType: previous.resource_type });
      }

      await database.query(
        `INSERT INTO onboarding_documents
          (application_id, document_type, public_id, resource_type, asset_format, bytes)
         VALUES (?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           public_id = VALUES(public_id),
           resource_type = VALUES(resource_type),
           asset_format = VALUES(asset_format),
           bytes = 0,
           version_id = NULL,
           verification_status = 'pending',
           verified_by = NULL,
           verified_at = NULL,
           rejection_reason = NULL`,
        [application.id, req.params.type, upload.publicId, upload.resourceType, upload.format],
      );

      return res.json({ data: upload });
    } catch (error) {
      return cloudinaryErrorResponse(res, error);
    }
  }));

  router.post('/applications/:id/documents/:type/complete', uploadLimiter, asyncHandler(async (req, res) => {
    const application = await getApplication(database, req);
    if (!application || application.id !== req.params.id) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    if (!DOCUMENT_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: 'Unsupported document type.' });
    }

    const [rows] = await database.query(
      `SELECT public_id, resource_type, asset_format, bytes
       FROM onboarding_documents
       WHERE application_id = ? AND document_type = ?
       FOR UPDATE`,
      [application.id, req.params.type],
    );
    const document = rows[0];

    if (!document) {
      return res.status(400).json({ error: 'Request an upload signature before completing this document.' });
    }

    try {
      const asset = await documentService.verifyUpload({
        publicId: document.public_id,
        resourceType: document.resource_type,
        format: document.asset_format,
      });

      await database.query(
        `UPDATE onboarding_documents
         SET bytes = ?, version_id = ?, verification_status = 'pending'
         WHERE application_id = ? AND document_type = ?`,
        [asset.bytes, asset.versionId, application.id, req.params.type],
      );

      return res.json({
        data: serializeDocument({
          document_type: req.params.type,
          asset_format: asset.format,
          bytes: asset.bytes,
          verification_status: 'pending',
          rejection_reason: '',
        }),
      });
    } catch (error) {
      return cloudinaryErrorResponse(res, error);
    }
  }));

  router.post('/applications/:id/submit', submissionLimiter, turnstileMiddleware, asyncHandler(async (req, res) => {
    const application = await getApplication(database, req);
    if (!application || application.id !== req.params.id) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    const profile = parseProfile(application.profile);
    const { errors, value } = validateRegistration({
      name: profile.name,
      email: profile.email,
      password: req.body?.password,
      registrationSource: 'onboarding',
    });

    if (req.body?.confirmPassword !== value.password) {
      errors.confirmPassword = 'Password confirmation does not match.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const passwordHash = await hashPassword(value.password);
    let result;

    try {
      result = await auditedTransaction(
        database,
        { id: null, name: profile.name, email: profile.email },
        {
          action: 'onboarding.submitted',
          entityType: 'onboarding',
          entityId: null,
          summary: `${profile.name} submitted employee onboarding documents.`,
          details: { email: profile.email, documentTypes: DOCUMENT_TYPES },
          ipAddress: req.ip,
        },
        async (connection) => {
          const [applicationRows] = await connection.query(
            `SELECT id, email, profile, status
             FROM onboarding_applications
             WHERE id = ? AND token_hash = ? AND status = 'draft' AND expires_at > UTC_TIMESTAMP(6)
             FOR UPDATE`,
            [application.id, hashOnboardingToken(req.cookies[ONBOARDING_COOKIE_NAME])],
          );
          const lockedApplication = applicationRows[0];

          if (!lockedApplication) {
            const error = new Error('Onboarding application not found.');
            error.status = 404;
            throw error;
          }

          const [documentRows] = await connection.query(
            `SELECT document_type, bytes FROM onboarding_documents
             WHERE application_id = ? AND bytes > 0`,
            [lockedApplication.id],
          );
          const uploadedTypes = new Set(documentRows.map((document) => document.document_type));
          if (DOCUMENT_TYPES.some((type) => !uploadedTypes.has(type))) {
            const error = new Error('Upload Aadhaar, PAN, and bank-book documents before submitting.');
            error.status = 400;
            throw error;
          }

          const [userRows] = await connection.query(
            'SELECT id, employee_id FROM users WHERE email = ? FOR UPDATE',
            [profile.email],
          );
          if (userRows.length > 0) {
            const error = new Error('An account with this email already exists.');
            error.code = 'ER_DUP_ENTRY';
            throw error;
          }

          const [employeeRows] = await connection.query(
            'SELECT id FROM employees WHERE email = ? AND deleted_at IS NULL FOR UPDATE',
            [profile.email],
          );
          let employeeId;

          if (employeeRows.length > 0) {
            employeeId = employeeRows[0].id;
            await connection.query(
              `UPDATE employees
               SET name = ?, phone = ?, department = ?, designation = ?, joining_date = ?, onboarding_status = 'pending'
               WHERE id = ?`,
              [profile.name, profile.phone, profile.department, profile.designation, profile.joining_date, employeeId],
            );
          } else {
            const [employeeResult] = await connection.query(
              `INSERT INTO employees
                (name, email, phone, department, designation, salary, joining_date, onboarding_status)
               VALUES (?, ?, ?, ?, ?, 0, ?, 'pending')`,
              [profile.name, profile.email, profile.phone, profile.department, profile.designation, profile.joining_date],
            );
            employeeId = employeeResult.insertId;
          }

          const [userResult] = await connection.query(
            `INSERT INTO users (name, email, password_hash, role, employee_id, status)
             VALUES (?, ?, ?, 'user', ?, 'pending')`,
            [profile.name, profile.email, passwordHash, employeeId],
          );

          await connection.query(
            `UPDATE onboarding_applications
             SET status = 'submitted', user_id = ?, employee_id = ?, submitted_at = UTC_TIMESTAMP(6)
             WHERE id = ?`,
            [userResult.insertId, employeeId, lockedApplication.id],
          );

          await recordAudit(connection, {
            user: { id: null, name: profile.name, email: profile.email },
            action: 'account.registered',
            entityType: 'account',
            entityId: userResult.insertId,
            summary: `${profile.name} registered an employee account pending approval.`,
            details: { role: 'user', source: 'onboarding', status: 'pending' },
            ipAddress: req.ip,
          });

          return { applicationId: lockedApplication.id, employeeId, userId: userResult.insertId };
        },
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'An account or employee with this email already exists.',
          errors: { email: 'An account or employee with this email already exists.' },
        });
      }
      throw error;
    }

    res.clearCookie(ONBOARDING_COOKIE_NAME, onboardingCookieOptions);
    return res.status(201).json({
      data: {
        applicationId: result.applicationId,
        status: 'submitted',
        message: 'Your onboarding was submitted. An administrator will review your documents before sign-in is enabled.',
      },
    });
  }));

  return router;
}
