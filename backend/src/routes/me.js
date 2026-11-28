import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { auditedTransaction } from '../audit.js';
import { EMPLOYEE_COLUMNS, serializeEmployee } from '../utils/employees.js';
import { getBusinessDate, inclusiveDayCount, isValidDateString } from '../utils/businessDate.js';
import { toUtcIso } from '../utils/time.js';
import { validateId } from '../validation.js';

const LEAVE_TYPES = new Set(['casual', 'sick', 'earned', 'unpaid', 'other']);
const MAX_GEO_ACCURACY_METRES = 100;
const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000;

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function serializePunch(punch) {
  return {
    id: punch.id,
    punchType: punch.punch_type,
    occurredAt: toUtcIso(punch.occurred_at),
    workDate: punch.work_date,
    latitude: punch.latitude === null ? null : Number(punch.latitude),
    longitude: punch.longitude === null ? null : Number(punch.longitude),
    accuracyM: punch.accuracy_m === null ? null : Number(punch.accuracy_m),
    clientCapturedAt: toUtcIso(punch.client_captured_at),
  };
}

function serializeLeave(leave) {
  return {
    id: leave.id,
    employeeId: leave.employee_id,
    employeeName: leave.employee_name || null,
    leaveType: leave.leave_type,
    startDate: leave.start_date,
    endDate: leave.end_date,
    dayCount: Number(leave.day_count),
    reason: leave.reason,
    status: leave.status,
    decisionComment: leave.decision_comment || '',
    decidedAt: toUtcIso(leave.decided_at),
    createdAt: toUtcIso(leave.created_at),
  };
}

function parseAttendanceRange(query) {
  const today = getBusinessDate(new Date(), config.appTimeZone);
  const from = query.from || query.date || today;
  const to = query.to || query.date || today;

  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return { errors: { range: 'Provide a valid date range.' } };
  }

  const days = inclusiveDayCount(from, to);
  if (days > 31) {
    return { errors: { range: 'Attendance date ranges cannot exceed 31 days.' } };
  }

  return { errors: {}, value: { from, to } };
}

function validatePunch(input) {
  const errors = {};
  const value = {};
  const type = input?.type;
  const location = input?.geolocation;

  if (!['in', 'out'].includes(type)) {
    errors.type = 'Punch type must be in or out.';
  } else {
    value.type = type;
  }

  if (!location || typeof location !== 'object') {
    errors.geolocation = 'Location is required. Enable location access and try again.';
    return { errors, value };
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  const capturedAt = new Date(location.capturedAt);
  const now = Date.now();

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.latitude = 'Invalid latitude.';
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.longitude = 'Invalid longitude.';
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_GEO_ACCURACY_METRES) {
    errors.accuracy = `Location accuracy must be ${MAX_GEO_ACCURACY_METRES} metres or better.`;
  }
  if (Number.isNaN(capturedAt.getTime())
    || Math.abs(capturedAt.getTime() - now) > MAX_CLIENT_CLOCK_SKEW_MS) {
    errors.capturedAt = 'Location timestamp is invalid or stale. Try again.';
  }

  if (Object.keys(errors).length === 0) {
    value.geolocation = {
      latitude,
      longitude,
      accuracy,
      capturedAt: capturedAt.toISOString().slice(0, 23).replace('T', ' '),
    };
  }

  return { errors, value };
}

function validateLeave(input) {
  const errors = {};
  const value = {};
  const leaveType = typeof input?.leaveType === 'string' ? input.leaveType.trim() : '';
  const startDate = typeof input?.startDate === 'string' ? input.startDate.trim() : '';
  const endDate = typeof input?.endDate === 'string' ? input.endDate.trim() : '';
  const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';

  if (!LEAVE_TYPES.has(leaveType)) {
    errors.leaveType = 'Choose a valid leave type.';
  } else {
    value.leaveType = leaveType;
  }

  if (!isValidDateString(startDate)) {
    errors.startDate = 'Enter a valid start date.';
  } else {
    value.startDate = startDate;
  }

  if (!isValidDateString(endDate)) {
    errors.endDate = 'Enter a valid end date.';
  } else {
    value.endDate = endDate;
  }

  if (!errors.startDate && !errors.endDate) {
    if (startDate > endDate) {
      errors.endDate = 'End date cannot be before the start date.';
    } else if (inclusiveDayCount(startDate, endDate) > 365) {
      errors.endDate = 'A leave request cannot exceed 365 calendar days.';
    } else {
      value.dayCount = inclusiveDayCount(startDate, endDate);
    }
  }

  if (reason.length < 3 || reason.length > 1000) {
    errors.reason = 'Reason must be between 3 and 1000 characters.';
  } else {
    value.reason = reason;
  }

  return { errors, value };
}

export function createMeRouter(database = pool, {
  mutationLimiter = (req, res, next) => next(),
} = {}) {
  const router = Router();

  function requireEmployee(req, res, next) {
    if (!req.user?.employee_id) {
      return res.status(404).json({ error: 'No employee profile is linked to this account.' });
    }
    return next();
  }

  router.get('/', requireEmployee, asyncHandler(async (req, res) => {
    const [rows] = await database.query(
      `SELECT ${EMPLOYEE_COLUMNS}, onboarding_status FROM employees WHERE id = ? AND deleted_at IS NULL`,
      [req.user.employee_id],
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Employee profile not found.' });
    }

    const today = getBusinessDate(new Date(), config.appTimeZone);
    const [punches] = await database.query(
      `SELECT id, punch_type, occurred_at, work_date, latitude, longitude, accuracy_m, client_captured_at
       FROM attendance_punches WHERE employee_id = ? AND work_date = ? ORDER BY occurred_at ASC`,
      [req.user.employee_id, today],
    );

    res.json({
      data: {
        employee: serializeEmployee(rows[0]),
        businessDate: today,
        timeZone: config.appTimeZone,
        punches: punches.map(serializePunch),
      },
    });
  }));

  router.get('/attendance', requireEmployee, asyncHandler(async (req, res) => {
    const { errors, value } = parseAttendanceRange(req.query);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Invalid attendance query.', errors });
    }

    const [rows] = await database.query(
      `SELECT id, punch_type, occurred_at, work_date, latitude, longitude, accuracy_m, client_captured_at
       FROM attendance_punches
       WHERE employee_id = ? AND work_date BETWEEN ? AND ?
       ORDER BY work_date ASC, occurred_at ASC`,
      [req.user.employee_id, value.from, value.to],
    );

    res.json({ data: rows.map(serializePunch), range: value });
  }));

  router.post('/attendance/punch', mutationLimiter, requireEmployee, asyncHandler(async (req, res) => {
    const { errors, value } = validatePunch(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const workDate = getBusinessDate(new Date(), config.appTimeZone);
    let punch;

    try {
      punch = await auditedTransaction(
        database,
        req.user,
        {
          action: value.type === 'in' ? 'attendance.punched_in' : 'attendance.punched_out',
          entityType: 'attendance',
          entityId: req.user.employee_id,
          summary: `${req.user.name} punched ${value.type} for ${workDate}.`,
          details: { workDate, accuracyM: value.geolocation.accuracy },
          ipAddress: req.ip,
        },
        async (connection) => {
          const [existingRows] = await connection.query(
            `SELECT punch_type, occurred_at FROM attendance_punches
             WHERE employee_id = ? AND work_date = ?
             FOR UPDATE`,
            [req.user.employee_id, workDate],
          );
          const existing = existingRows.find((row) => row.punch_type === value.type);

          if (existing) {
            const error = new Error(`You have already punched ${value.type} today.`);
            error.status = 409;
            throw error;
          }

          if (value.type === 'out' && !existingRows.some((row) => row.punch_type === 'in')) {
            const error = new Error('Punch in before punching out.');
            error.status = 409;
            throw error;
          }

          const [result] = await connection.query(
            `INSERT INTO attendance_punches
              (employee_id, punch_type, occurred_at, work_date, latitude, longitude, accuracy_m, client_captured_at, ip_address)
             VALUES (?, ?, UTC_TIMESTAMP(6), ?, ?, ?, ?, ?, ?)`,
            [
              req.user.employee_id,
              value.type,
              workDate,
              value.geolocation.latitude,
              value.geolocation.longitude,
              value.geolocation.accuracy,
              value.geolocation.capturedAt,
              req.ip,
            ],
          );

          const [rows] = await connection.query(
            `SELECT id, punch_type, occurred_at, work_date, latitude, longitude, accuracy_m, client_captured_at
             FROM attendance_punches WHERE id = ?`,
            [result.insertId],
          );
          return rows[0];
        },
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: `You have already punched ${value.type} today.` });
      }
      throw error;
    }

    return res.status(201).json({ data: serializePunch(punch), businessDate: workDate });
  }));

  router.get('/leave', requireEmployee, asyncHandler(async (req, res) => {
    const [rows] = await database.query(
      `SELECT id, employee_id, leave_type, start_date, end_date, day_count, reason, status,
              decision_comment, decided_at, created_at
       FROM leave_requests WHERE employee_id = ?
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.employee_id],
    );
    res.json({ data: rows.map(serializeLeave) });
  }));

  router.post('/leave', mutationLimiter, requireEmployee, asyncHandler(async (req, res) => {
    const { errors, value } = validateLeave(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const leave = await auditedTransaction(
      database,
      req.user,
      {
        action: 'leave.requested',
        entityType: 'leave',
        entityId: req.user.employee_id,
        summary: `${req.user.name} requested ${value.dayCount} day(s) of ${value.leaveType} leave.`,
        details: { startDate: value.startDate, endDate: value.endDate, dayCount: value.dayCount },
        ipAddress: req.ip,
      },
      async (connection) => {
        const [overlapping] = await connection.query(
          `SELECT id FROM leave_requests
           WHERE employee_id = ? AND status IN ('pending', 'approved')
             AND start_date <= ? AND end_date >= ?
           FOR UPDATE`,
          [req.user.employee_id, value.endDate, value.startDate],
        );

        if (overlapping.length > 0) {
          const error = new Error('You already have a pending or approved leave request for these dates.');
          error.status = 409;
          throw error;
        }

        const [result] = await connection.query(
          `INSERT INTO leave_requests
            (employee_id, leave_type, start_date, end_date, day_count, reason)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.user.employee_id, value.leaveType, value.startDate, value.endDate, value.dayCount, value.reason],
        );

        const [rows] = await connection.query(
          `SELECT id, employee_id, leave_type, start_date, end_date, day_count, reason, status,
                  decision_comment, decided_at, created_at
           FROM leave_requests WHERE id = ?`,
          [result.insertId],
        );
        return rows[0];
      },
    );

    return res.status(201).json({ data: serializeLeave(leave) });
  }));

  router.post('/leave/:id/cancel', mutationLimiter, requireEmployee, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid leave request ID.' });
    }

    let leave;
    try {
      leave = await auditedTransaction(
        database,
        req.user,
        {
          action: 'leave.cancelled',
          entityType: 'leave',
          entityId: req.user.employee_id,
          summary: `${req.user.name} cancelled leave request ${id}.`,
          ipAddress: req.ip,
        },
        async (connection) => {
          const [rows] = await connection.query(
            `SELECT id, employee_id, leave_type, start_date, end_date, day_count, reason, status,
                    decision_comment, decided_at, created_at
             FROM leave_requests WHERE id = ? AND employee_id = ?
             FOR UPDATE`,
            [id, req.user.employee_id],
          );

          if (!rows[0]) {
            const error = new Error('Leave request not found.');
            error.status = 404;
            throw error;
          }
          if (rows[0].status !== 'pending') {
            const error = new Error('Only pending leave requests can be cancelled.');
            error.status = 409;
            throw error;
          }

          await connection.query("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", [id]);
          const [updatedRows] = await connection.query(
            `SELECT id, employee_id, leave_type, start_date, end_date, day_count, reason, status,
                    decision_comment, decided_at, created_at
             FROM leave_requests WHERE id = ?`,
            [id],
          );
          return updatedRows[0];
        },
      );
    } catch (error) {
      throw error;
    }

    return res.json({ data: serializeLeave(leave) });
  }));

  return router;
}
