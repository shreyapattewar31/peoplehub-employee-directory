import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import {
  auditedTransaction,
  employeeChanges,
  updatedEmployeeSummary,
} from '../audit.js';
import { requireAdmin } from '../middleware/auth.js';
import { parseListQuery, validateEmployee, validateId } from '../validation.js';
import { EMPLOYEE_COLUMNS, serializeEmployee } from '../utils/employees.js';
import {
  deleteEmployeePhoto,
  getEmployeePhotoPath,
  getEmployeePhotoUrl,
  IMAGE_POLICY,
  saveEmployeePhoto,
} from '../services/employeePhotos.js';
import { recordSystemLog } from '../logger.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_POLICY.maxBytes, files: 1 },
});

export function createEmployeesRouter(database = pool, {
  mutationLimiter = (req, res, next) => next(),
  uploadLimiter = (req, res, next) => next(),
  turnstileMiddleware = (req, res, next) => next(),
} = {}) {
  const router = Router();

  async function findEmployee(id, connection = database) {
    const [rows] = await connection.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  router.get('/departments', asyncHandler(async (req, res) => {
    const [rows] = await database.query(
      'SELECT department FROM employees WHERE deleted_at IS NULL GROUP BY department ORDER BY department ASC',
    );
    res.json({ data: rows.map((row) => row.department) });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { errors, value } = parseListQuery(req.query);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Invalid query parameters.', errors });
    }

    const {
      page,
      limit,
      search,
      department,
      sortBy,
      sortOrder,
    } = value;
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      params.push(pattern, pattern, pattern);
    }

    if (department) {
      conditions.push('department = ?');
      params.push(department);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const offset = (page - 1) * limit;

    const [countRows] = await database.query(
      `SELECT COUNT(*) AS total FROM employees ${whereClause}`,
      params,
    );
    const total = Number(countRows[0].total);

    const [rows] = await database.query(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM employees
       ${whereClause}
       ORDER BY ${sortBy} ${sortOrder.toUpperCase()}, id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({
      data: rows.map(serializeEmployee),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const employee = await findEmployee(id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ data: serializeEmployee(employee) });
  }));

  router.post('/', mutationLimiter, turnstileMiddleware, requireAdmin, asyncHandler(async (req, res) => {
    const { errors, value } = validateEmployee(req.body);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const employee = await auditedTransaction(
      database,
      req.user,
      (createdEmployee) => ({
        action: 'employee.created',
        entityType: 'employee',
        entityId: createdEmployee.id,
        summary: `Added employee ${createdEmployee.name}.`,
        details: { fields: Object.keys(value) },
        ipAddress: req.ip,
      }),
      async (connection) => {
        const [result] = await connection.query(
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

        return findEmployee(result.insertId, connection);
      },
    );

    res.status(201)
      .location(`/api/employees/${employee.id}`)
      .json({ data: serializeEmployee(employee) });
  }));

  router.put('/:id', mutationLimiter, turnstileMiddleware, requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const existingEmployee = await findEmployee(id);

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const { errors, value } = validateEmployee(req.body);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const employee = await auditedTransaction(
      database,
      req.user,
      (updatedEmployee) => {
        if (!updatedEmployee) {
          return null;
        }

        const changes = employeeChanges(existingEmployee, updatedEmployee);
        return {
          action: 'employee.updated',
          entityType: 'employee',
          entityId: id,
          summary: updatedEmployeeSummary(updatedEmployee, changes),
          details: { changes },
          ipAddress: req.ip,
        };
      },
      async (connection) => {
        await connection.query(
          `UPDATE employees
           SET name = ?, email = ?, phone = ?, department = ?, designation = ?,
               salary = ?, joining_date = ?
           WHERE id = ?`,
          [
            value.name,
            value.email,
            value.phone,
            value.department,
            value.designation,
            value.salary,
            value.joining_date,
            id,
          ],
        );

        return findEmployee(id, connection);
      },
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ data: serializeEmployee(employee) });
  }));

  router.patch('/:id', mutationLimiter, turnstileMiddleware, requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const existingEmployee = await findEmployee(id);

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const { errors, value } = validateEmployee(req.body, { partial: true });

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const updatedValues = { ...existingEmployee, ...value };
    const employee = await auditedTransaction(
      database,
      req.user,
      (updatedEmployee) => {
        if (!updatedEmployee) {
          return null;
        }

        const changes = employeeChanges(existingEmployee, updatedEmployee);
        return {
          action: 'employee.updated',
          entityType: 'employee',
          entityId: id,
          summary: updatedEmployeeSummary(updatedEmployee, changes),
          details: { changes },
          ipAddress: req.ip,
        };
      },
      async (connection) => {
        await connection.query(
          `UPDATE employees
           SET name = ?, email = ?, phone = ?, department = ?, designation = ?,
               salary = ?, joining_date = ?
           WHERE id = ?`,
          [
            updatedValues.name,
            updatedValues.email,
            updatedValues.phone,
            updatedValues.department,
            updatedValues.designation,
            updatedValues.salary,
            updatedValues.joining_date,
            id,
          ],
        );

        return findEmployee(id, connection);
      },
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ data: serializeEmployee(employee) });
  }));

  router.get('/:id/photo', mutationLimiter, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const employee = await findEmployee(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee photo not found.' });
    }

    const cloudinaryUrl = getEmployeePhotoUrl(employee.photo_path);
    if (cloudinaryUrl) {
      res.set('Cache-Control', 'private, max-age=300');
      return res.redirect(302, cloudinaryUrl);
    }

    const photoPath = getEmployeePhotoPath(employee.photo_path);
    if (!photoPath) {
      return res.status(404).json({ error: 'Employee photo not found.' });
    }

    try {
      const photo = await readFile(photoPath);
      res.set('Cache-Control', 'private, max-age=300');
      return res.type('image/webp').send(photo);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'Employee photo not found.' });
      }
      throw error;
    }
  }));

  router.post('/:id/photo', uploadLimiter, upload.single('photo'), turnstileMiddleware, requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const existingEmployee = await findEmployee(id);
    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed.',
        errors: { photo: 'Choose an image to upload.' },
      });
    }

    const filename = await saveEmployeePhoto(req.file.buffer);
    let employee;

    try {
      employee = await auditedTransaction(
        database,
        req.user,
        (updatedEmployee) => ({
          action: 'employee.updated',
          entityType: 'employee',
          entityId: id,
          summary: `Updated the photo for ${updatedEmployee.name}.`,
          details: { changes: [{ field: 'photo_path', label: 'photo' }] },
          ipAddress: req.ip,
        }),
        async (connection) => {
          await connection.query('UPDATE employees SET photo_path = ? WHERE id = ?', [filename, id]);
          return findEmployee(id, connection);
        },
      );
    } catch (error) {
      await deleteEmployeePhoto(filename);
      throw error;
    }

    if (existingEmployee.photo_path && existingEmployee.photo_path !== filename) {
      await deleteEmployeePhoto(existingEmployee.photo_path);
    }

    res.json({ data: serializeEmployee(employee) });
  }));

  router.delete('/:id/photo', uploadLimiter, turnstileMiddleware, requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const existingEmployee = await findEmployee(id);
    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    if (!existingEmployee.photo_path) {
      return res.status(204).end();
    }

    await auditedTransaction(
      database,
      req.user,
      {
        action: 'employee.updated',
        entityType: 'employee',
        entityId: id,
        summary: `Removed the photo for ${existingEmployee.name}.`,
        details: { changes: [{ field: 'photo_path', label: 'photo' }] },
        ipAddress: req.ip,
      },
      async (connection) => {
        await connection.query('UPDATE employees SET photo_path = NULL WHERE id = ?', [id]);
        return { removed: true };
      },
    );

    await deleteEmployeePhoto(existingEmployee.photo_path);
    res.status(204).end();
  }));

  router.delete('/:id', mutationLimiter, turnstileMiddleware, requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'Employee ID must be a positive integer.' });
    }

    const existingEmployee = await findEmployee(id);

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    await auditedTransaction(
      database,
      req.user,
      (result) => result ? {
        action: 'employee.deleted',
        entityType: 'employee',
        entityId: id,
        summary: `Deleted employee ${existingEmployee.name}.`,
        details: { email: existingEmployee.email, department: existingEmployee.department },
        ipAddress: req.ip,
      } : null,
      async (connection) => {
        const [result] = await connection.query(
          'UPDATE employees SET deleted_at = UTC_TIMESTAMP(6) WHERE id = ? AND deleted_at IS NULL',
          [id],
        );

        if (result.affectedRows === 0) {
          return null;
        }

        await connection.query("UPDATE users SET status = 'blocked' WHERE employee_id = ?", [id]);
        return { deleted: true };
      },
    );

    if (existingEmployee.photo_path) {
      try {
        await deleteEmployeePhoto(existingEmployee.photo_path);
      } catch (error) {
        await recordSystemLog(database, {
          level: 'error',
          event: 'employee.photo_cleanup_failed',
          message: error.message,
          userId: req.user.id,
          ipAddress: req.ip,
        });
      }
    }

    res.status(204).end();
  }));

  return router;
}
