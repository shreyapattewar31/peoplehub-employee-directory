import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { createAuthMiddleware, requireAdmin } from './middleware/auth.js';
import { createAuditLogsRouter } from './routes/auditLogs.js';
import { createAuthRouter } from './routes/auth.js';
import { createEmployeesRouter } from './routes/employees.js';
import { createOnboardingRouter } from './routes/onboarding.js';
import { createOnboardingApplicationsRouter } from './routes/onboardingApplications.js';
import { createOnboardingReviewRouter } from './routes/onboardingReview.js';
import { createAdminRouter } from './routes/admin.js';
import { createMeRouter } from './routes/me.js';
import { createAdminWorkforceRouter } from './routes/adminWorkforce.js';
import { verifyTurnstile } from './turnstile.js';
import { createRateLimiters } from './middleware/rateLimiters.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';

const clientDirectory = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));

export function createApp(database = pool, {
  authMiddleware,
  turnstileMiddleware = verifyTurnstile,
  rateLimiters = createRateLimiters(),
  emailSender,
} = {}) {
  const app = express();
  const authenticate = authMiddleware || createAuthMiddleware(database);

  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res, next) => {
    try {
      await database.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/auth', createAuthRouter(database, authenticate, {
    authLimiter: rateLimiters.auth,
    turnstileMiddleware,
  }));
  app.use('/api/onboarding', createOnboardingApplicationsRouter(database, {
    submissionLimiter: rateLimiters.submission,
    uploadLimiter: rateLimiters.upload,
    turnstileMiddleware,
  }));
  app.use('/api/onboarding', createOnboardingRouter(database, authenticate, {
    submissionLimiter: rateLimiters.submission,
    mutationLimiter: rateLimiters.mutation,
    turnstileMiddleware,
  }));
  app.use('/api/me', authenticate, createMeRouter(database, {
    mutationLimiter: rateLimiters.mutation,
  }));
  app.use('/api/employees', authenticate, requireAdmin, createEmployeesRouter(database, {
    mutationLimiter: rateLimiters.mutation,
    uploadLimiter: rateLimiters.upload,
    turnstileMiddleware,
  }));
  app.use('/api/audit-logs', authenticate, requireAdmin, createAuditLogsRouter(database));
  app.use('/api/admin', authenticate, requireAdmin, createAdminRouter(database, {
    mutationLimiter: rateLimiters.mutation,
    exportLimiter: rateLimiters.export,
    turnstileMiddleware,
    emailSender,
  }));
  app.use('/api/admin/onboarding', authenticate, requireAdmin, createOnboardingReviewRouter(database));
  app.use('/api/admin/workforce', authenticate, requireAdmin, createAdminWorkforceRouter(database, {
    mutationLimiter: rateLimiters.mutation,
  }));
  app.use('/api', notFoundHandler);

  if (existsSync(clientDirectory)) {
    app.use(express.static(clientDirectory));
    app.get('*', (req, res) => res.sendFile(`${clientDirectory}index.html`));
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(database));

  return app;
}
