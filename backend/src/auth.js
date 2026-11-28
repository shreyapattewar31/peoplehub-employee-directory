import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { toUtcIso } from './utils/time.js';

export const SESSION_COOKIE_NAME = 'peoplehub_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  path: '/',
};

export function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    status: user.status || 'active',
    employeeId: user.employee_id ?? null,
    created_at: toUtcIso(user.created_at),
    updated_at: toUtcIso(user.updated_at),
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(database, userId) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  await database.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [tokenHash, userId],
  );
  await database.query('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');

  return token;
}

export async function destroySession(database, token) {
  if (!token) {
    return;
  }

  await database.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export async function getSessionUser(database, token) {
  if (!token) {
    return null;
  }

  const [rows] = await database.query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.employee_id, u.created_at, u.updated_at,
            e.onboarding_status, e.deleted_at, s.expires_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [hashToken(token)],
  );

  return rows[0] ?? null;
}
