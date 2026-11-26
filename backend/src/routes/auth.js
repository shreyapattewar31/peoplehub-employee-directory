import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { auditedTransaction } from '../audit.js';
import { validateLogin, validateRegistration } from '../authValidation.js';
import {
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  serializeUser,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
  verifyPassword,
} from '../auth.js';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

export function createAuthRouter(database = pool, authMiddleware) {
  const router = Router();

  router.post('/register', authLimiter, asyncHandler(async (req, res) => {
    const { errors, value } = validateRegistration(req.body);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const [existingUsers] = await database.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [value.email],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(value.password);
    let account;

    try {
      const session = await auditedTransaction(
        database,
        (result) => result.user,
        (result) => ({
          action: 'account.registered',
          entityType: 'account',
          entityId: result.user.id,
          summary: `${result.user.name} registered as ${result.user.role === 'admin' ? 'administrator' : 'member'}.`,
          details: { role: result.user.role },
          ipAddress: req.ip,
        }),
        async (connection) => {
          const [countRows] = await connection.query(
            'SELECT COUNT(*) AS total FROM users FOR UPDATE',
          );
          const role = Number(countRows[0].total) === 0 ? 'admin' : 'user';
          const [result] = await connection.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [value.name, value.email, passwordHash, role],
          );
          const user = {
            id: result.insertId,
            name: value.name,
            email: value.email,
            role,
            created_at: new Date(),
          };
          const token = await createSession(connection, user.id);

          return { user, token };
        },
      );

      account = session.user;
      res.cookie(SESSION_COOKIE_NAME, session.token, {
        ...sessionCookieOptions,
        maxAge: SESSION_MAX_AGE_MS,
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      throw error;
    }

    return res.status(201).json({ data: serializeUser(account) });
  }));

  router.post('/login', authLimiter, asyncHandler(async (req, res) => {
    const { errors, value } = validateLogin(req.body);

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed.', errors });
    }

    const [users] = await database.query(
      'SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ? LIMIT 1',
      [value.email],
    );
    const user = users[0];

    if (!user || !(await verifyPassword(value.password, user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    const token = await auditedTransaction(
      database,
      user,
      {
        action: 'auth.login',
        entityType: 'account',
        entityId: user.id,
        summary: `${user.name} signed in.`,
        ipAddress: req.ip,
      },
      (connection) => createSession(connection, user.id),
    );

    res.cookie(SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions,
      maxAge: SESSION_MAX_AGE_MS,
    });

    return res.json({ data: serializeUser(user) });
  }));

  router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
    res.json({ data: serializeUser(req.user) });
  }));

  router.post('/logout', asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    const user = await getSessionUser(database, token);

    if (user) {
      await auditedTransaction(
        database,
        user,
        {
          action: 'auth.logout',
          entityType: 'account',
          entityId: user.id,
          summary: `${user.name} signed out.`,
          ipAddress: req.ip,
        },
        (connection) => destroySession(connection, token),
      );
    } else {
      await destroySession(database, token);
    }

    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    return res.status(204).end();
  }));

  return router;
}
