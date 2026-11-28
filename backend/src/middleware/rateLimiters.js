import rateLimit from 'express-rate-limit';

const message = (text) => ({
  error: text,
  errors: { form: text },
});

function createLimiter(options, enabled) {
  if (!enabled) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...options,
  });
}

export function createRateLimiters({ enabled = true } = {}) {
  return {
    auth: createLimiter({
      limit: 20,
      message: message('Too many attempts. Please try again in 15 minutes.'),
    }, enabled),
    mutation: createLimiter({
      limit: 120,
      message: message('Too many changes were submitted. Please try again shortly.'),
    }, enabled),
    upload: createLimiter({
      limit: 30,
      message: message('Too many uploads were submitted. Please try again shortly.'),
    }, enabled),
    submission: createLimiter({
      limit: 120,
      message: message('Too many form submissions. Please try again later.'),
    }, enabled),
    export: createLimiter({
      limit: 20,
      message: message('Too many downloads were requested. Please try again shortly.'),
    }, enabled),
  };
}
