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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const clientDirectory = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));

export function createApp(database = pool, { authMiddleware } = {}) {
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

  app.use('/api/auth', createAuthRouter(database, authenticate));
  app.use('/api/employees', authenticate, createEmployeesRouter(database));
  app.use('/api/audit-logs', authenticate, requireAdmin, createAuditLogsRouter(database));
  app.use('/api', notFoundHandler);

  if (existsSync(clientDirectory)) {
    app.use(express.static(clientDirectory));
    app.get('*', (req, res) => res.sendFile(`${clientDirectory}index.html`));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
