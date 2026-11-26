import { config, validateConfig } from './src/config.js';
import { pool } from './src/db.js';
import { createApp } from './src/app.js';

try {
  validateConfig();
  await pool.query('SELECT 1');

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Employee Directory API running at http://localhost:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/api/health`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Unable to start the server: ${error.message}`);
  await pool.end();
  process.exit(1);
}
