import { toUtcIso } from './time.js';

export const EMPLOYEE_COLUMNS =
  'id, name, email, phone, department, designation, salary, joining_date, photo_path, photo_public_id, onboarding_status, deleted_at, created_at, updated_at';

export function serializeEmployee(employee) {
  if (!employee) {
    return null;
  }

  const { photo_path, ...record } = employee;
  return {
    ...record,
    created_at: toUtcIso(record.created_at),
    updated_at: toUtcIso(record.updated_at),
    photo_url: photo_path ? `/api/employees/${record.id}/photo` : null,
  };
}
