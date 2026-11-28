import { pool } from '../db.js';
import {
  destroySession,
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

      if (user.status !== 'active' || (user.employee_id && (user.deleted_at || user.onboarding_status !== 'approved'))) {
        await destroySession(database, req.cookies?.[SESSION_COOKIE_NAME]);
        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
        return res.status(403).json({
          error: user.status === 'pending'
            ? 'Your account is awaiting administrator approval.'
            : user.status === 'blocked'
              ? 'Your account has been blocked. Contact an administrator.'
              : 'Your employee account is not active.',
          code: user.status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_INACTIVE',
        });
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
