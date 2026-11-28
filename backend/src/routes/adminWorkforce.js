import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { auditedTransaction } from '../audit.js';
import { getBusinessDate, inclusiveDayCount, isValidDateString } from '../utils/businessDate.js';
import { toUtcIso } from '../utils/time.js';
import { validateId } from '../validation.js';

const LEAVE_STATUSES = new Set(['pending', 'approved', 'rejected', 'cancelled']);

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function serializeAttendance(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    punchType: row.punch_type,
    occurredAt: toUtcIso(row.occurred_at),
    workDate: row.work_date,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
    clientCapturedAt: toUtcIso(row.client_captured_at),
  };
}

function serializeLeave(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    dayCount: Number(row.day_count),
    reason: row.reason,
    status: row.status,
    decisionComment: row.decision_comment || '',
    decidedBy: row.decided_by || null,
    decidedAt: toUtcIso(row.decided_at),
    createdAt: toUtcIso(row.created_at),
  };
}

function attendanceRange(query) {
  const today = getBusinessDate(new Date(), config.appTimeZone);
  const from = query.from || query.date || today;
  const to = query.to || query.date || today;

  if (!isValidDateString(from) || !isValidDateString(to) || from > to || inclusiveDayCount(from, to) > 31) {
    return null;
  }
  return { from, to };
}

export function createAdminWorkforceRouter(database = pool, {
  mutationLimiter = (req, res, next) => next(),
} = {}) {
  const router = Router();

  router.get('/attendance', asyncHandler(async (req, res) => {
    const range = attendanceRange(req.query);
    if (!range) {
      return res.status(400).json({ error: 'Provide a valid attendance date range of no more than 31 days.' });
    }

    const employeeId = req.query.employeeId ? validateId(req.query.employeeId) : null;
    if (req.query.employeeId && !employeeId) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const conditions = ['p.work_date BETWEEN ? AND ?'];
    const params = [range.from, range.to];
    if (employeeId) {
      conditions.push('p.employee_id = ?');
      params.push(employeeId);
    }

    const [rows] = await database.query(
      `SELECT p.id, p.employee_id, p.punch_type, p.occurred_at, p.work_date,
              p.latitude, p.longitude, p.accuracy_m, p.client_captured_at,
              e.name AS employee_name, e.email AS employee_email
       FROM attendance_punches p
       INNER JOIN employees e ON e.id = p.employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.occurred_at DESC, e.name ASC`,
      params,
    );

    res.json({ data: rows.map(serializeAttendance), range });
  }));

  router.get('/leave', asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const status = LEAVE_STATUSES.has(req.query.status) ? req.query.status : '';
    const employeeId = req.query.employeeId ? validateId(req.query.employeeId) : null;
    if (req.query.employeeId && !employeeId) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const conditions = [];
    const params = [];
    if (status) {
      conditions.push('l.status = ?');
      params.push(status);
    }
    if (employeeId) {
      conditions.push('l.employee_id = ?');
      params.push(employeeId);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [countRows] = await database.query(
      `SELECT COUNT(*) AS total FROM leave_requests l ${whereClause}`,
      params,
    );
    const [rows] = await database.query(
      `SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.day_count,
              l.reason, l.status, l.decision_comment, l.decided_by, l.decided_at, l.created_at,
              e.name AS employee_name, e.email AS employee_email
       FROM leave_requests l
       INNER JOIN employees e ON e.id = l.employee_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const total = Number(countRows[0].total);
    res.json({
      data: rows.map(serializeLeave),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  }));

  router.post('/leave/:id/decision', mutationLimiter, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    const decision = req.body?.decision;
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';

    if (!id) {
      return res.status(400).json({ error: 'Invalid leave request ID.' });
    }
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    }
    if (comment.length > 500) {
      return res.status(400).json({ error: 'Decision comment cannot exceed 500 characters.' });
    }
    if (decision === 'rejected' && !comment) {
      return res.status(400).json({ error: 'A comment is required when rejecting leave.' });
    }

    const leave = await auditedTransaction(
      database,
      req.user,
      (result) => ({
        action: decision === 'approved' ? 'leave.approved' : 'leave.rejected',
        entityType: 'leave',
        entityId: result.employee_id,
        summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} leave request ${id} for ${result.employee_name}.`,
        details: { leaveRequestId: id, decision, comment: comment || null },
        ipAddress: req.ip,
      }),
      async (connection) => {
        const [rows] = await connection.query(
          `SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.day_count,
                  l.reason, l.status, l.decision_comment, l.decided_by, l.decided_at, l.created_at,
                  e.name AS employee_name, e.email AS employee_email
           FROM leave_requests l
           INNER JOIN employees e ON e.id = l.employee_id
           WHERE l.id = ?
           FOR UPDATE`,
          [id],
        );

        if (!rows[0]) {
          const error = new Error('Leave request not found.');
          error.status = 404;
          throw error;
        }
        if (rows[0].status !== 'pending') {
          const error = new Error('Only pending leave requests can be decided.');
          error.status = 409;
          throw error;
        }

        await connection.query(
          `UPDATE leave_requests
           SET status = ?, decided_by = ?, decision_comment = ?, decided_at = UTC_TIMESTAMP(6)
           WHERE id = ?`,
          [decision, req.user.id, comment || null, id],
        );

        const [updatedRows] = await connection.query(
          `SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.day_count,
                  l.reason, l.status, l.decision_comment, l.decided_by, l.decided_at, l.created_at,
                  e.name AS employee_name, e.email AS employee_email
           FROM leave_requests l
           INNER JOIN employees e ON e.id = l.employee_id
           WHERE l.id = ?`,
          [id],
        );
        return updatedRows[0];
      },
    );

    res.json({ data: serializeLeave(leave) });
  }));

  return router;
}
