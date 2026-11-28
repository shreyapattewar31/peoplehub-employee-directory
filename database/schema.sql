CREATE DATABASE IF NOT EXISTS employee_directory
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE employee_directory;

CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  department VARCHAR(100) NOT NULL,
  designation VARCHAR(100) NOT NULL,
  salary DECIMAL(12, 2) NOT NULL,
  joining_date DATE NOT NULL,
  photo_path VARCHAR(255) NULL,
  photo_public_id VARCHAR(255) NULL,
  onboarding_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
  deleted_at DATETIME(6) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employees_email (email),
  KEY idx_employees_department (department),
  KEY idx_employees_joining_date (joining_date),
  KEY idx_employees_onboarding_status (onboarding_status),
  KEY idx_employees_deleted_at (deleted_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  employee_id INT UNSIGNED NULL,
  status ENUM('pending', 'active', 'blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_employee_id (employee_id),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id)
    REFERENCES employees (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user_id (user_id),
  KEY idx_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS onboarding_submissions (
  response_id VARCHAR(190) COLLATE utf8mb4_bin NOT NULL,
  employee_id INT UNSIGNED NULL,
  employee_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (response_id),
  KEY idx_onboarding_submissions_employee (employee_id),
  CONSTRAINT fk_onboarding_submissions_employee FOREIGN KEY (employee_id)
    REFERENCES employees (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS onboarding_applications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(255) NOT NULL,
  profile JSON NOT NULL,
  status ENUM('draft', 'submitted', 'expired') NOT NULL DEFAULT 'draft',
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
  CONSTRAINT fk_onboarding_applications_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_onboarding_applications_employee FOREIGN KEY (employee_id)
    REFERENCES employees (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS onboarding_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  document_type ENUM('aadhaar', 'pan', 'bank_book') NOT NULL,
  public_id VARCHAR(255) NOT NULL,
  resource_type ENUM('image', 'raw') NOT NULL,
  asset_format VARCHAR(20) NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  version_id VARCHAR(255) NULL,
  verification_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME(6) NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_onboarding_documents_public_id (public_id),
  UNIQUE KEY uq_onboarding_documents_application_type (application_id, document_type),
  KEY idx_onboarding_documents_status (verification_status),
  CONSTRAINT fk_onboarding_documents_application FOREIGN KEY (application_id)
    REFERENCES onboarding_applications (id) ON DELETE CASCADE,
  CONSTRAINT fk_onboarding_documents_verifier FOREIGN KEY (verified_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_punches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id INT UNSIGNED NOT NULL,
  punch_type ENUM('in', 'out') NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  work_date DATE NOT NULL,
  latitude DECIMAL(9, 6) NULL,
  longitude DECIMAL(10, 6) NULL,
  accuracy_m DECIMAL(8, 2) NULL,
  client_captured_at DATETIME(6) NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_employee_date_type (employee_id, work_date, punch_type),
  KEY idx_attendance_employee_date (employee_id, work_date),
  KEY idx_attendance_occurred_at (occurred_at),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id)
    REFERENCES employees (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id INT UNSIGNED NOT NULL,
  leave_type VARCHAR(30) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  day_count SMALLINT UNSIGNED NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  decided_by INT UNSIGNED NULL,
  decision_comment VARCHAR(500) NULL,
  decided_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_leave_employee_status (employee_id, status),
  KEY idx_leave_status_dates (status, start_date, end_date),
  KEY idx_leave_employee_dates (employee_id, start_date, end_date),
  CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id)
    REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_decider FOREIGN KEY (decided_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  level VARCHAR(20) NOT NULL,
  event VARCHAR(100) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  context JSON NULL,
  user_id INT UNSIGNED NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_system_logs_created_at (created_at),
  KEY idx_system_logs_level (level),
  CONSTRAINT fk_system_logs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  user_name VARCHAR(100) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INT UNSIGNED NULL,
  summary VARCHAR(500) NOT NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_user_id (user_id),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(50) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
