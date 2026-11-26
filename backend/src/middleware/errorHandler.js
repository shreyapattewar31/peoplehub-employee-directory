export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'An employee with this email address already exists.',
    });
  }

  if (error.code === 'ER_DATA_TOO_LONG') {
    return res.status(400).json({ error: 'One or more values are too long.' });
  }

  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ENOTFOUND'].includes(error.code)) {
    return res.status(503).json({
      error: 'The database is unavailable. Please try again later.',
    });
  }

  console.error('Unhandled server error:', error);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
}
