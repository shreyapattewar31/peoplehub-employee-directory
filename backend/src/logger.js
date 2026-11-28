function writeConsole(level, event, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    ...context,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export async function recordSystemLog(database, {
  level = 'info',
  event,
  message,
  context = {},
  userId = null,
  ipAddress = null,
}) {
  writeConsole(level, event, message, { userId, ipAddress, ...context });

  if (typeof database?.query !== 'function') {
    return;
  }

  try {
    await database.query(
      `INSERT INTO system_logs
        (level, event, message, context, user_id, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [level, event, message, JSON.stringify(context), userId, ipAddress],
    );
  } catch (error) {
    writeConsole('error', 'system_log.write_failed', error.message);
  }
}
