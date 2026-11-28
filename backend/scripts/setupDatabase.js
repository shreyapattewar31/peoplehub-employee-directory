import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config, validateConfig } from '../src/config.js';
import { runMigrations } from '../migrations/001_expandPeopleHub.js';

try {
  validateConfig();

  if (!/^[A-Za-z0-9_]+$/.test(config.database.database)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores.');
  }

  const schemaPath = fileURLToPath(new URL('../../database/schema.sql', import.meta.url));
  const schema = (await readFile(schemaPath, 'utf8')).replaceAll(
    'employee_directory',
    config.database.database,
  );
  const connection = await mysql.createConnection({
    ...config.database,
    multipleStatements: true,
  });

  await connection.query(schema);

  const [roleColumns] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
    [config.database.database],
  );

  if (roleColumns.length === 0) {
    await connection.query(
      `ALTER TABLE users
       ADD COLUMN role ENUM('admin', 'user') NOT NULL DEFAULT 'user'
       AFTER password_hash`,
    );
  }

  const columnUpgrades = [
    ['employees', 'photo_path', "ADD COLUMN photo_path VARCHAR(255) NULL AFTER joining_date"],
    ['employees', 'updated_at', 'ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'],
    ['users', 'updated_at', 'ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'],
  ];

  for (const [table, column, definition] of columnUpgrades) {
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [config.database.database, table, column],
    );

    if (columns.length === 0) {
      await connection.query(`ALTER TABLE ${table} ${definition}`);
    }
  }

  await runMigrations(connection, config.database.database);

  const [adminRows] = await connection.query(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
  );

  if (adminRows.length === 0) {
    const [userRows] = await connection.query(
      'SELECT id FROM users ORDER BY id ASC LIMIT 1',
    );

    if (userRows.length > 0) {
      await connection.query("UPDATE users SET role = 'admin' WHERE id = ?", [userRows[0].id]);
      console.log(`Existing account ${userRows[0].id} was promoted to administrator.`);
    }
  }

  await connection.end();
  console.log(`Database "${config.database.database}" is ready.`);
} catch (error) {
  console.error(`Database setup failed: ${error.message}`);
  process.exit(1);
}
