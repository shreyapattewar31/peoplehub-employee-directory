import { createHash } from 'node:crypto';

const VERSION = '001_expandPeopleHub';
const CHECKSUM = createHash('sha256').update(VERSION).digest('hex');

async function hasColumn(connection, databaseName, table, column) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, table, column],
  );
  return rows.length > 0;
}

async function hasIndex(connection, databaseName, table, indexName) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [databaseName, table, indexName],
  );
  return rows.length > 0;
}

async function hasConstraint(connection, databaseName, table, constraintName) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [databaseName, table, constraintName],
  );
  return rows.length > 0;
}

async function addColumn(connection, databaseName, table, column, definition) {
  if (!(await hasColumn(connection, databaseName, table, column))) {
    await connection.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function addIndex(connection, databaseName, table, indexName, definition) {
  if (!(await hasIndex(connection, databaseName, table, indexName))) {
    await connection.query(`ALTER TABLE ${table} ADD ${definition}`);
  }
}

export async function runMigrations(connection, databaseName) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await addColumn(connection, databaseName, 'employees', 'photo_public_id', 'photo_public_id VARCHAR(255) NULL AFTER photo_path');
  await addColumn(connection, databaseName, 'employees', 'onboarding_status', "onboarding_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER photo_public_id");
  await addColumn(connection, databaseName, 'employees', 'deleted_at', 'deleted_at DATETIME(6) NULL AFTER onboarding_status');
  await addIndex(connection, databaseName, 'employees', 'idx_employees_onboarding_status', 'INDEX idx_employees_onboarding_status (onboarding_status)');
  await addIndex(connection, databaseName, 'employees', 'idx_employees_deleted_at', 'INDEX idx_employees_deleted_at (deleted_at)');

  await addColumn(connection, databaseName, 'users', 'employee_id', 'employee_id INT UNSIGNED NULL AFTER role');
  await addColumn(connection, databaseName, 'users', 'status', "status ENUM('pending','active','blocked') NOT NULL DEFAULT 'active' AFTER employee_id");
  await addIndex(connection, databaseName, 'users', 'uq_users_employee_id', 'UNIQUE INDEX uq_users_employee_id (employee_id)');
  await addIndex(connection, databaseName, 'users', 'idx_users_status', 'INDEX idx_users_status (status)');

  if (!(await hasConstraint(connection, databaseName, 'users', 'fk_users_employee'))) {
    await connection.query(
      'ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE SET NULL',
    );
  }

  await connection.query(
    `CREATE TABLE IF NOT EXISTS onboarding_applications (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      email VARCHAR(255) NOT NULL,
      profile JSON NOT NULL,
      status ENUM('draft','submitted','expired') NOT NULL DEFAULT 'draft',
      user_id INT UNSIGNED NULL,
      employee_id INT UNSIGNED NULL,
      submitted_at DATETIME(6) NULL,
      expires_at DATETIME(6) NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_onboarding_applications_token (token_hash),
      UNIQUE KEY uq_onboarding_applications_user (user_id),
      KEY idx_onboarding_applications_email (email),
      KEY idx_onboarding_applications_status (status),
      KEY idx_onboarding_applications_employee (employee_id),
      KEY idx_onboarding_applications_expires (expires_at),
      CONSTRAINT fk_onboarding_applications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_onboarding_applications_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS onboarding_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      document_type ENUM('aadhaar','pan','bank_book') NOT NULL,
      public_id VARCHAR(255) NOT NULL,
      resource_type ENUM('image','raw') NOT NULL,
      asset_format VARCHAR(20) NOT NULL,
      bytes INT UNSIGNED NOT NULL,
      version_id VARCHAR(255) NULL,
      verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
      verified_by INT UNSIGNED NULL,
      verified_at DATETIME(6) NULL,
      rejection_reason VARCHAR(500) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_onboarding_documents_public_id (public_id),
      UNIQUE KEY uq_onboarding_documents_application_type (application_id, document_type),
      KEY idx_onboarding_documents_status (verification_status),
      CONSTRAINT fk_onboarding_documents_application FOREIGN KEY (application_id) REFERENCES onboarding_applications (id) ON DELETE CASCADE,
      CONSTRAINT fk_onboarding_documents_verifier FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS attendance_punches (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id INT UNSIGNED NOT NULL,
      punch_type ENUM('in','out') NOT NULL,
      occurred_at DATETIME(6) NOT NULL,
      work_date DATE NOT NULL,
      latitude DECIMAL(9,6) NULL,
      longitude DECIMAL(10,6) NULL,
      accuracy_m DECIMAL(8,2) NULL,
      client_captured_at DATETIME(6) NULL,
      ip_address VARCHAR(45) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY uq_attendance_employee_date_type (employee_id, work_date, punch_type),
      KEY idx_attendance_employee_date (employee_id, work_date),
      KEY idx_attendance_occurred_at (occurred_at),
      CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS leave_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id INT UNSIGNED NOT NULL,
      leave_type VARCHAR(30) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      day_count SMALLINT UNSIGNED NOT NULL,
      reason VARCHAR(1000) NOT NULL,
      status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
      decided_by INT UNSIGNED NULL,
      decision_comment VARCHAR(500) NULL,
      decided_at DATETIME(6) NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      KEY idx_leave_employee_status (employee_id, status),
      KEY idx_leave_status_dates (status, start_date, end_date),
      KEY idx_leave_employee_dates (employee_id, start_date, end_date),
      CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
      CONSTRAINT fk_leave_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await connection.query(
    `INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)`,
    [VERSION, CHECKSUM],
  );
}
