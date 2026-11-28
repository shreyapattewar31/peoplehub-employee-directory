import mysql from 'mysql2/promise';
import { config, validateConfig } from '../src/config.js';
import { runMigrations } from '../migrations/001_expandPeopleHub.js';

let connection;

try {
  validateConfig();
  connection = await mysql.createConnection(config.database);
  await runMigrations(connection, config.database.database);
  console.log(`Database "${config.database.database}" migrations are complete.`);
} catch (error) {
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
