import { Router } from 'express';
import { pool } from '../db.js';
import { parseAuditLogQuery } from '../validation.js';
import { toUtcIso } from '../utils/time.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function serializeAuditLog(row) {
  let details = row.details;

  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      details = null;
    }
  }

  return { ...row, details, created_at: toUtcIso(row.created_at) };
}

export function createAuditLogsRouter(database = pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { errors, value } = parseAuditLogQuery(req.query);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Invalid query parameters.', errors });
    }

    const conditions = [];
    const params = [];

    if (value.action) {
      conditions.push('action = ?');
      params.push(value.action);
    }

    if (value.entityType) {
      conditions.push('entity_type = ?');
      params.push(value.entityType);
    }

    if (value.search) {
      const pattern = `%${value.search}%`;
      conditions.push('(summary LIKE ? OR user_name LIKE ? OR user_email LIKE ?)');
      params.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const offset = (value.page - 1) * value.limit;
    const [countRows] = await database.query(
      `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`,
      params,
    );
    const total = Number(countRows[0].total);
    const [rows] = await database.query(
      `SELECT id, user_id, user_name, user_email, action, entity_type,
              entity_id, summary, details, ip_address, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, value.limit, offset],
    );

    res.json({
      data: rows.map(serializeAuditLog),
      pagination: {
        page: value.page,
        limit: value.limit,
        total,
        totalPages: Math.ceil(total / value.limit),
      },
    });
  }));

  return router;
}
