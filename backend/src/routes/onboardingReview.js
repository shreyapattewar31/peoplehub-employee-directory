import { Router } from 'express';
import { pool } from '../db.js';
import { auditedTransaction } from '../audit.js';
import { cloudinaryDocuments } from '../services/cloudinary.js';
import { toUtcIso } from '../utils/time.js';

const DOCUMENT_TYPES = ['aadhaar', 'pan', 'bank_book'];
const APPLICATION_ID_PATTERN = /^[a-f0-9-]{36}$/i;

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

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

function serializeDocument(document, applicationId) {
  return {
    documentType: document.document_type,
    format: document.asset_format,
    bytes: Number(document.bytes || 0),
    versionId: document.version_id,
    uploaded: Number(document.bytes || 0) > 0,
    verificationStatus: document.verification_status,
    rejectionReason: document.rejection_reason || '',
    verifiedAt: toUtcIso(document.verified_at),
    downloadPath: document.bytes > 0
      ? `/admin/onboarding/applications/${applicationId}/documents/${document.document_type}/download`
      : null,
  };
}

async function getApplication(database, applicationId, { forUpdate = false } = {}) {
  const [rows] = await database.query(
    `SELECT a.id, a.email, a.profile, a.status, a.user_id, a.employee_id, a.submitted_at,
            u.id AS user_record_id, u.status AS account_status, u.name AS user_name, u.email AS user_email,
            e.name AS employee_name, e.email AS employee_email, e.onboarding_status
     FROM onboarding_applications a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN employees e ON e.id = a.employee_id
     WHERE a.id = ?
     ${forUpdate ? 'LIMIT 1 FOR UPDATE' : 'LIMIT 1'}`,
    [applicationId],
  );
  return rows[0] || null;
}

async function getDocuments(database, applicationId) {
  const [rows] = await database.query(
    `SELECT id, document_type, asset_format, bytes, version_id, verification_status,
            rejection_reason, verified_at
     FROM onboarding_documents
     WHERE application_id = ?
     ORDER BY FIELD(document_type, 'aadhaar', 'pan', 'bank_book')`,
    [applicationId],
  );
  return rows.map((document) => serializeDocument(document, applicationId));
}

function serializeApplication(application, documents) {
  return {
    applicationId: application.id,
    email: application.email,
    profile: parseProfile(application.profile),
    status: application.status,
    accountStatus: application.account_status,
    onboardingStatus: application.onboarding_status,
    employeeName: application.employee_name,
    submittedAt: toUtcIso(application.submitted_at),
    documents,
  };
}

export function createOnboardingReviewRouter(database = pool, {
  documentService = cloudinaryDocuments,
} = {}) {
  const router = Router();

  router.get('/applications', asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const status = ['submitted', 'draft', 'expired'].includes(req.query.status)
      ? req.query.status
      : 'submitted';
    const search = typeof req.query.q === 'string' ? `%${req.query.q.trim().slice(0, 100)}%` : '%';
    const offset = (page - 1) * pageSize;

    const [countRows] = await database.query(
      `SELECT COUNT(*) AS total
       FROM onboarding_applications a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.status = ? AND (a.email LIKE ? OR e.name LIKE ?)`,
      [status, search, search],
    );

    const [rows] = await database.query(
      `SELECT a.id, a.email, a.profile, a.status, a.submitted_at,
              u.status AS account_status,
              e.name AS employee_name, e.onboarding_status,
              COUNT(d.id) AS document_count,
              SUM(d.verification_status = 'verified') AS verified_count
       FROM onboarding_applications a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN employees e ON e.id = a.employee_id
       LEFT JOIN onboarding_documents d ON d.application_id = a.id
       WHERE a.status = ? AND (a.email LIKE ? OR e.name LIKE ?)
       GROUP BY a.id, a.email, a.profile, a.status, a.submitted_at, u.status, e.name, e.onboarding_status
       ORDER BY a.submitted_at DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [status, search, search, pageSize, offset],
    );

    return res.json({
      data: rows.map((application) => ({
        applicationId: application.id,
        email: application.email,
        name: parseProfile(application.profile).name || application.employee_name,
        status: application.status,
        accountStatus: application.account_status,
        onboardingStatus: application.onboarding_status,
        submittedAt: toUtcIso(application.submitted_at),
        documentCount: Number(application.document_count),
        verifiedCount: Number(application.verified_count),
      })),
      pagination: {
        page,
        pageSize,
        total: Number(countRows[0].total),
        totalPages: Math.max(1, Math.ceil(Number(countRows[0].total) / pageSize)),
      },
    });
  }));

  router.get('/applications/:id', asyncHandler(async (req, res) => {
    if (!APPLICATION_ID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    const application = await getApplication(database, req.params.id);
    if (!application) {
      return res.status(404).json({ error: 'Onboarding application not found.' });
    }

    return res.json({
      data: serializeApplication(application, await getDocuments(database, application.id)),
    });
  }));

  router.get('/applications/:id/documents/:type/download', asyncHandler(async (req, res) => {
    if (!DOCUMENT_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: 'Unsupported document type.' });
    }

    const [rows] = await database.query(
      `SELECT d.public_id, d.resource_type, d.asset_format, d.bytes
       FROM onboarding_documents d
       INNER JOIN onboarding_applications a ON a.id = d.application_id
       WHERE a.id = ? AND d.document_type = ? AND d.bytes > 0`,
      [req.params.id, req.params.type],
    );
    const document = rows[0];

    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    try {
      return res.redirect(302, documentService.downloadUrl({
        publicId: document.public_id,
        resourceType: document.resource_type,
        format: document.asset_format,
      }));
    } catch (error) {
      if (error.code === 'CLOUDINARY_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Document downloads are temporarily unavailable.' });
      }
      throw error;
    }
  }));

  router.post('/applications/:id/documents/:type/verify', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (!['verified', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be verified or rejected.' });
    }
    if (!DOCUMENT_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: 'Unsupported document type.' });
    }
    if (decision === 'rejected' && (!reason || reason.length > 500)) {
      return res.status(400).json({ error: 'A rejection reason between 1 and 500 characters is required.' });
    }

    const result = await auditedTransaction(
      database,
      req.user,
      (outcome) => ({
        action: decision === 'verified' ? 'onboarding.document_verified' : 'onboarding.document_rejected',
        entityType: 'onboarding',
        entityId: outcome.employeeId,
        summary: `${decision === 'verified' ? 'Verified' : 'Rejected'} ${req.params.type.replace('_', '-')} for ${outcome.application.email}.`,
        details: { applicationId: req.params.id, documentType: req.params.type, decision, reason: reason || null },
        ipAddress: req.ip,
      }),
      async (connection) => {
        const application = await getApplication(connection, req.params.id, { forUpdate: true });
        if (!application || application.status !== 'submitted') {
          const error = new Error('Onboarding application not found.');
          error.status = 404;
          throw error;
        }

        const [documentRows] = await connection.query(
          `SELECT id, bytes FROM onboarding_documents
           WHERE application_id = ? AND document_type = ?
           FOR UPDATE`,
          [req.params.id, req.params.type],
        );
        if (!documentRows[0] || Number(documentRows[0].bytes) <= 0) {
          const error = new Error('Document not found.');
          error.status = 404;
          throw error;
        }

        await connection.query(
          `UPDATE onboarding_documents
           SET verification_status = ?, verified_by = ?, verified_at = UTC_TIMESTAMP(6), rejection_reason = ?
           WHERE id = ?`,
          [decision, req.user.id, decision === 'rejected' ? reason : null, documentRows[0].id],
        );

        return { application, employeeId: application.employee_id };
      },
    );

    return res.json({
      data: serializeApplication(result.application, await getDocuments(database, req.params.id)),
    });
  }));

  router.post('/applications/:id/decision', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    }
    if (comment.length > 500) {
      return res.status(400).json({ error: 'Decision comment cannot exceed 500 characters.' });
    }

    const result = await auditedTransaction(
      database,
      req.user,
      (outcome) => ({
        action: decision === 'approved' ? 'onboarding.approved' : 'onboarding.rejected',
        entityType: 'onboarding',
        entityId: outcome.employeeId,
        summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} employee onboarding for ${outcome.application.email}.`,
        details: { applicationId: req.params.id, decision, comment: comment || null },
        ipAddress: req.ip,
      }),
      async (connection) => {
        const application = await getApplication(connection, req.params.id, { forUpdate: true });
        if (!application || application.status !== 'submitted') {
          const error = new Error('Onboarding application not found.');
          error.status = 404;
          throw error;
        }

        if (decision === 'approved') {
          const [documentRows] = await connection.query(
            `SELECT document_type, verification_status, bytes FROM onboarding_documents
             WHERE application_id = ?
             FOR UPDATE`,
            [req.params.id],
          );
          const documents = new Map(documentRows.map((document) => [document.document_type, document]));
          const missing = DOCUMENT_TYPES.filter((type) => !documents.has(type)
            || Number(documents.get(type).bytes) <= 0
            || documents.get(type).verification_status !== 'verified');

          if (missing.length > 0) {
            const error = new Error(`Verify all documents before approval. Remaining: ${missing.join(', ')}.`);
            error.status = 409;
            throw error;
          }
        }

        await connection.query(
          `UPDATE employees SET onboarding_status = ? WHERE id = ?`,
          [decision, application.employee_id],
        );
        await connection.query(
          `UPDATE users SET status = ? WHERE id = ?`,
          [decision === 'approved' ? 'active' : 'blocked', application.user_record_id],
        );

        return { application, employeeId: application.employee_id };
      },
    );

    return res.json({
      data: serializeApplication(result.application, await getDocuments(database, req.params.id)),
      message: decision === 'approved'
        ? 'Employee approved. Their account can now sign in.'
        : 'Employee onboarding rejected. Sign-in remains blocked.',
    });
  }));

  return router;
}
