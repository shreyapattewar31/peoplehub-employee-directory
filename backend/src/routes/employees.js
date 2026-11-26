import { Router } from 'express';
import { pool } from '../db.js';
import {
  auditedTransaction,
  employeeChanges,
  updatedEmployeeSummary,
} from '../audit.js';
import { requireAdmin } from '../middleware/auth.js';
import { parseListQuery, validateEmployee, validateId } from '../validation.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const EMPLOYEE_COLUMNS =
  'id, name, email, phone, department, designation, salary, joining_date, created_at';

export function createEmployeesRouter(database = pool) {
  const router = Router();

  async function findEmployee(id, connection = database) {
    const [rows] = await connection.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = ?`,
      [id],
    );
    return rows[0] ?? null;
  }

  router.get('/departments', asyncHandler(async (req, res) => {
    const [rows] = await database.query(
      'SELECT department FROM employees GROUP BY department ORDER BY department ASC',
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
    const conditions = [];
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
      data: rows,
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

    res.json({ data: employee });
  }));

  router.post('/', requireAdmin, asyncHandler(async (req, res) => {
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
      .json({ data: employee });
  }));

  router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
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

    res.json({ data: employee });
  }));

  router.patch('/:id', requireAdmin, asyncHandler(async (req, res) => {
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

    res.json({ data: employee });
  }));

  router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
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
        const [result] = await connection.query('DELETE FROM employees WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
          return null;
        }

        return { deleted: true };
      },
    );

    res.status(204).end();
  }));

  return router;
}
