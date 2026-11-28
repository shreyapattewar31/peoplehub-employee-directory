import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { normalizeBaseUrl } from './utils/url.js';

dotenv.config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
});

process.env.TZ ||= 'UTC';

const nodeEnv = process.env.NODE_ENV || 'development';
const turnstileTestSecrets = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);
const developmentTurnstileSecret = '1x0000000000000000000000000000000AA';
const turnstileAllowedHostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES || '')
  .split(',')
  .map((hostname) => hostname.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  publicAppUrl: process.env.PUBLIC_APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  appTimeZone: process.env.APP_TIMEZONE || 'UTC',
  turnstile: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || (nodeEnv === 'production' ? '' : developmentTurnstileSecret),
    allowedHostnames: turnstileAllowedHostnames,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
  },
  documents: {
    maxBytes: Number(process.env.DOCUMENT_MAX_BYTES || 5 * 1024 * 1024),
    draftTtlHours: Number(process.env.ONBOARDING_DRAFT_TTL_HOURS || 24),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
  image: {
    maxBytes: 2 * 1024 * 1024,
    minDimension: 128,
    maxDimension: 4096,
    outputDimension: 800,
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'employee_directory',
    ssl: process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}),
        }
      : undefined,
  },
};

export function validateConfig() {
  const missing = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter(
    (name) => !process.env[name],
  );

  if (config.nodeEnv === 'production' && !process.env.TURNSTILE_SECRET_KEY) {
    missing.push('TURNSTILE_SECRET_KEY');
  }

  if (config.nodeEnv === 'production' && turnstileTestSecrets.has(config.turnstile.secretKey)) {
    throw new Error('TURNSTILE_SECRET_KEY must be a production secret key when NODE_ENV=production.');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: config.appTimeZone }).format();
  } catch {
    throw new Error('APP_TIMEZONE must be a valid IANA time zone, such as UTC or Asia/Kolkata.');
  }

  config.clientOrigin = normalizeBaseUrl(config.clientOrigin, 'CLIENT_ORIGIN');
  config.publicAppUrl = normalizeBaseUrl(config.publicAppUrl, 'PUBLIC_APP_URL');

  if (config.turnstile.allowedHostnames.some((hostname) => /[/\\\s@]/.test(hostname))) {
    throw new Error('TURNSTILE_ALLOWED_HOSTNAMES must contain comma-separated hostnames without protocols or paths.');
  }

  if (config.turnstile.allowedHostnames.length === 0) {
    config.turnstile.allowedHostnames = [...new Set([
      new URL(config.clientOrigin).hostname.toLowerCase(),
      new URL(config.publicAppUrl).hostname.toLowerCase(),
    ])];
  }

  const smtpVariables = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
  const hasSmtpConfiguration = smtpVariables.some((name) => Boolean(process.env[name]));

  if (hasSmtpConfiguration) {
    if (!config.smtp.host) {
      missing.push('SMTP_HOST');
    }
    if (!config.smtp.from) {
      missing.push('SMTP_FROM');
    }
    if (!Number.isInteger(config.smtp.port) || config.smtp.port < 1 || config.smtp.port > 65535) {
      throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
    }
    if (process.env.SMTP_SECURE !== undefined && !['true', 'false'].includes(process.env.SMTP_SECURE)) {
      throw new Error('SMTP_SECURE must be true or false.');
    }
    if (Boolean(config.smtp.user) !== Boolean(config.smtp.password)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.smtp.from)) {
      throw new Error('SMTP_FROM must be a valid email address.');
    }
  }

  const cloudinaryVariables = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const hasCloudinaryConfiguration = cloudinaryVariables.some((name) => Boolean(process.env[name]));

  if (hasCloudinaryConfiguration) {
    for (const name of cloudinaryVariables) {
      if (!process.env[name]) {
        missing.push(name);
      }
    }
  }

  if (config.nodeEnv === 'production') {
    for (const name of cloudinaryVariables) {
      if (!process.env[name]) {
        missing.push(name);
      }
    }
  }

  if (!Number.isInteger(config.documents.maxBytes) || config.documents.maxBytes < 1024 || config.documents.maxBytes > 20 * 1024 * 1024) {
    throw new Error('DOCUMENT_MAX_BYTES must be an integer between 1 KB and 20 MB.');
  }

  if (!Number.isInteger(config.documents.draftTtlHours) || config.documents.draftTtlHours < 1 || config.documents.draftTtlHours > 168) {
    throw new Error('ONBOARDING_DRAFT_TTL_HOURS must be an integer between 1 and 168.');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
