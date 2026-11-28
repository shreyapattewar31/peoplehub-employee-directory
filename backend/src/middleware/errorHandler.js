import { recordSystemLog } from '../logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

export function createErrorHandler(database) {
  return async (error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ error: error.message });
    }

    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must contain valid JSON.' });
    }

    if (error.type === 'entity.too.large' || error.code === 'IMAGE_TOO_LARGE') {
      return res.status(413).json({
        error: error.code === 'IMAGE_TOO_LARGE'
          ? 'Image must be 2 MB or smaller.'
          : 'Request body is too large.',
        errors: error.code === 'IMAGE_TOO_LARGE' ? { photo: error.message } : undefined,
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Image must be 2 MB or smaller.',
        errors: { photo: 'Choose an image no larger than 2 MB.' },
      });
    }

    if (['LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT'].includes(error.code)) {
      return res.status(400).json({
        error: 'Invalid image upload.',
        errors: { photo: 'Choose one image using the photo upload field.' },
      });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'An employee with this email address already exists.',
        errors: { email: 'An employee with this email address already exists.' },
      });
    }

    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ error: 'One or more values are too long.' });
    }

    if (error.code === 'INVALID_IMAGE') {
      return res.status(400).json({
        error: error.message,
        errors: { photo: error.message },
      });
    }

    if (error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ error: error.message });
    }

    if (error.code === 'SMTP_SEND_FAILED') {
      return res.status(502).json({ error: error.message });
    }

    if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ENOTFOUND'].includes(error.code)) {
      return res.status(503).json({
        error: 'The database is unavailable. Please try again later.',
      });
    }

    await recordSystemLog(database, {
      level: 'error',
      event: 'http.unhandled_error',
      message: error.message,
      context: { method: req.method, path: req.path, code: error.code || 'UNEXPECTED' },
      userId: req.user?.id || null,
      ipAddress: req.ip,
    });

    return res.status(500).json({ error: 'Something went wrong on the server.' });
  };
}
