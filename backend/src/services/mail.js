import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter;

export function isSmtpConfigured() {
  return Boolean(
    config.smtp.host
    && config.smtp.from
    && (!config.smtp.user || config.smtp.password),
  );
}

export async function sendMail({ to, subject, text }) {
  if (!isSmtpConfigured()) {
    const error = new Error('SMTP is not configured. Add the SMTP environment variables and restart the API.');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  transporter ||= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.password }
      : undefined,
  });

  try {
    return await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
    });
  } catch {
    const error = new Error('The email service is unavailable. Check the SMTP settings and try again.');
    error.code = 'SMTP_SEND_FAILED';
    throw error;
  }
}
