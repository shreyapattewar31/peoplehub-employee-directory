import { pool } from '../db.js';
import {
  getSessionUser,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth.js';

export function createAuthMiddleware(database = pool) {
  return async (req, res, next) => {
    try {
      const user = await getSessionUser(database, req.cookies?.[SESSION_COOKIE_NAME]);

      if (!user) {
        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
        return res.status(401).json({ error: 'Please sign in to continue.' });
      }

      req.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access is required.' });
  }

  return next();
}

export const requireAuth = createAuthMiddleware();
