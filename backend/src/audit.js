export const AUDIT_ACTIONS = [
  'account.registered',
  'auth.login',
  'auth.logout',
  'employee.created',
  'employee.updated',
  'employee.deleted',
  'settings.updated',
  'onboarding.form_link_saved',
  'onboarding.submitted',
  'onboarding.document_verified',
  'onboarding.document_rejected',
  'onboarding.approved',
  'onboarding.rejected',
  'attendance.punched_in',
  'attendance.punched_out',
  'leave.requested',
  'leave.cancelled',
  'leave.approved',
  'leave.rejected',
  'email.sent',
  'data.exported',
];

const EMPLOYEE_FIELD_LABELS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  department: 'department',
  designation: 'designation',
  salary: 'salary',
  joining_date: 'joining date',
  photo_path: 'photo',
};

export async function recordAudit(database, {
  user,
  action,
  entityType,
  entityId = null,
  summary,
  details = null,
  ipAddress = null,
}) {
  await database.query(
    `INSERT INTO audit_logs
      (user_id, user_name, user_email, action, entity_type, entity_id, summary, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.name,
      user.email,
      action,
      entityType,
      entityId,
      summary,
      details ? JSON.stringify(details) : null,
      ipAddress,
    ],
  );
}

export async function auditedTransaction(database, user, audit, operation) {
  const resolveAudit = (result) => {
    const entry = typeof audit === 'function' ? audit(result) : audit;
    if (!entry) {
      return null;
    }

    return {
      user: typeof user === 'function' ? user(result) : user,
      ...entry,
    };
  };

  if (typeof database.getConnection !== 'function') {
    const result = await operation(database);
    const auditEntry = resolveAudit(result);
    if (auditEntry) {
      await recordAudit(database, auditEntry);
    }
    return result;
  }

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    const auditEntry = resolveAudit(result);
    if (auditEntry) {
      await recordAudit(connection, auditEntry);
    }
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function employeeChanges(before, after) {
  return Object.entries(EMPLOYEE_FIELD_LABELS)
    .filter(([field]) => {
      const previousValue = field === 'salary' ? Number(before[field]) : String(before[field] ?? '');
      const nextValue = field === 'salary' ? Number(after[field]) : String(after[field] ?? '');
      return previousValue !== nextValue;
    })
    .map(([field, label]) => ({
      field,
      label,
      before: before[field],
      after: after[field],
    }));
}

export function updatedEmployeeSummary(employee, changes) {
  if (changes.length === 0) {
    return `Saved employee ${employee.name} with no field changes.`;
  }

  return `Updated ${employee.name}: ${changes.map((change) => change.label).join(', ')}.`;
}
