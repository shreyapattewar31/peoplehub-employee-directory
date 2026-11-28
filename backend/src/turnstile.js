import { config } from './config.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const TEST_SECRET_KEYS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

class TurnstileServiceError extends Error {
  constructor() {
    super('Turnstile verification is unavailable.');
    this.name = 'TurnstileServiceError';
  }
}

export function isTurnstileConfigured() {
  return Boolean(config.turnstile.secretKey);
}

export function createTurnstileVerifier({
  secretKey = config.turnstile.secretKey,
  allowedHostnames = config.turnstile.allowedHostnames,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  return async function verifyTurnstileToken(token, remoteip) {
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
      return { ok: false, code: 'invalid' };
    }

    if (!secretKey || typeof fetchImpl !== 'function') {
      throw new TurnstileServiceError();
    }

    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (typeof remoteip === 'string' && remoteip) {
      body.set('remoteip', remoteip);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let result;
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TurnstileServiceError();
      }

      result = await response.json();
    } catch (error) {
      if (error instanceof TurnstileServiceError) {
        throw error;
      }
      throw new TurnstileServiceError();
    } finally {
      clearTimeout(timeout);
    }

    if (!result || typeof result.success !== 'boolean') {
      throw new TurnstileServiceError();
    }

    if (!result.success) {
      const errorCodes = Array.isArray(result['error-codes']) ? result['error-codes'] : [];
      if (errorCodes.some((code) => [
        'missing-input-secret',
        'invalid-input-secret',
        'bad-request',
        'internal-error',
      ].includes(code))) {
        throw new TurnstileServiceError();
      }

      return {
        ok: false,
        code: errorCodes.includes('timeout-or-duplicate') ? 'expired' : 'invalid',
      };
    }

    if (!TEST_SECRET_KEYS.has(secretKey)
      && allowedHostnames.length > 0
      && !allowedHostnames.includes(String(result.hostname || '').toLowerCase())) {
      return { ok: false, code: 'hostname' };
    }

    return { ok: true };
  };
}

export const verifyTurnstileToken = createTurnstileVerifier();

export function createTurnstileMiddleware(verifier = verifyTurnstileToken) {
  return async function verifyTurnstile(req, res, next) {
    const token = req.body?.['cf-turnstile-response'];

    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
      return res.status(400).json({
        error: 'Security verification failed.',
        errors: { captcha: 'Complete the security check and try again.' },
      });
    }

    let result;
    try {
      result = await verifier(token, req.ip);
    } catch {
      return res.status(502).json({
        error: 'The security check is temporarily unavailable. Please try again.',
        errors: { captcha: 'The security service could not be reached. Try again shortly.' },
      });
    }

    if (result.ok) {
      return next();
    }

    const message = result.code === 'expired'
      ? 'The security check expired or was already used. Complete it again.'
      : 'Complete the security check and try again.';
    return res.status(400).json({
      error: 'Security verification failed.',
      errors: { captcha: message },
    });
  };
}

export const verifyTurnstile = createTurnstileMiddleware();
