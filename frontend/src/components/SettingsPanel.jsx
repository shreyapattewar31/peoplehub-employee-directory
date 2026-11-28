import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  downloadBackup,
  getAdminSettings,
  listSystemLogs,
  saveAdminSettings,
  sendTestEmail,
} from '../api.js';
import { clearDraft, readDraft, writeDraft } from '../utils/drafts.js';
import { formatDateTime } from '../utils/format.js';
import { saveDisplayPreferences } from '../utils/preferences.js';
import TurnstileField from './TurnstileField.jsx';
import Icon from './Icon.jsx';

const TIME_ZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
];

const DEFAULTS = { timezone: 'UTC', dateFormat: 'short', timeFormat: '12h' };

export default function SettingsPanel({ onNotify }) {
  const [settings, setSettings] = useState(null);
  const [values, setValues] = useState(() => readDraft('admin.settings', DEFAULTS));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTurnstileError, setEmailTurnstileError] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logLevel, setLogLevel] = useState('');
  const [logsError, setLogsError] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [dataset, setDataset] = useState('all');
  const [format, setFormat] = useState('json');
  const [isExporting, setIsExporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const settingsTurnstile = useRef(null);
  const emailTurnstile = useRef(null);

  const notify = useCallback((type, text) => {
    if (onNotify) onNotify(type, text);
  }, [onNotify]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      setIsLoading(true);
      try {
        const response = await getAdminSettings({ signal: controller.signal });
        setSettings(response.data);
        const stored = readDraft('admin.settings', {});
        const nextValues = {
          timezone: stored.timezone || response.data.timezone,
          dateFormat: stored.dateFormat || response.data.dateFormat,
          timeFormat: stored.timeFormat || response.data.timeFormat,
        };
        setValues(nextValues);
        saveDisplayPreferences(nextValues);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setMessage({ type: 'error', text: error.message || 'Administrator settings could not be loaded.' });
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadSettings();
    return () => controller.abort();
  }, []);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    setLogsError('');
    try {
      const response = await listSystemLogs({ limit: 100, level: logLevel });
      setLogs(response.data);
    } catch (error) {
      setLogsError(error.message || 'System logs could not be loaded.');
    } finally {
      setIsLoadingLogs(false);
    }
  }, [logLevel]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleSettingsSave = async (event) => {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    setIsSaving(true);

    try {
      const response = await saveAdminSettings(values, settingsTurnstile.current?.getValue() || {});
      setSettings((current) => ({ ...current, ...response.data }));
      saveDisplayPreferences(response.data);
      clearDraft('admin.settings');
      setValues(response.data);
      setMessage({ type: 'success', text: 'Display settings saved.' });
      notify('success', 'Display settings updated.');
      settingsTurnstile.current?.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        settingsTurnstile.current?.refresh();
      }
      setMessage({ type: 'error', text: error.message || 'Settings could not be saved.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmailTest = async (event) => {
    event.preventDefault();
    setEmailMessage('');
    setEmailError('');
    setEmailTurnstileError('');
    setIsSendingEmail(true);

    try {
      await sendTestEmail(email, emailTurnstile.current?.getValue() || {});
      setEmailMessage(`Test email sent to ${email}.`);
      notify('success', 'Test email sent successfully.');
      emailTurnstile.current?.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setEmailError(error.errors.to || '');
        setEmailTurnstileError(error.errors.captcha || '');
      }
      setEmailError((current) => current || error.message || 'The test email could not be sent.');
      emailTurnstile.current?.refresh();
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleBackup = async () => {
    setIsExporting(true);
    setBackupMessage('');
    try {
      const result = await downloadBackup({ dataset, format });
      setBackupMessage(`Downloaded ${result.filename}.`);
      notify('success', 'Backup download started.');
    } catch (error) {
      setBackupMessage(error.message || 'The backup could not be downloaded.');
      notify('error', error.message || 'Backup download failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const updateSetting = (field, value) => {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    saveDisplayPreferences(nextValues);
    writeDraft('admin.settings', nextValues);
    setErrors((current) => ({ ...current, [field]: '' }));
    setMessage(null);
  };

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Administration</p>
          <h1 id="settings-title">Admin Settings</h1>
          <p className="page-description">Configure display preferences, email delivery, security, logs, and backups.</p>
        </div>
        <span className="role-badge"><Icon name="shield" size={15} />Admin only</span>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} settings-alert`} role={message.type === 'success' ? 'status' : 'alert'}>
          <Icon name={message.type === 'success' ? 'check' : 'alert'} size={18} />
          <span>{message.text}</span>
          <button type="button" className="alert-dismiss" onClick={() => setMessage(null)} aria-label="Dismiss settings message">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      <div className="settings-grid">
        <article className="settings-card settings-card-wide">
          <div className="settings-card-heading">
            <span className="settings-icon"><Icon name="clock" size={20} /></span>
            <div><h2>Time and date</h2><p>Timestamps are stored in UTC and displayed using these preferences.</p></div>
          </div>
          <form onSubmit={handleSettingsSave} noValidate>
            <div className="settings-form-grid">
              <div className="form-field">
                <label htmlFor="settings-timezone">Time zone</label>
                <input
                  id="settings-timezone"
                  list="timezone-options"
                  value={values.timezone}
                  onChange={(event) => updateSetting('timezone', event.target.value)}
                  disabled={isSaving || isLoading}
                  aria-invalid={Boolean(errors.timezone)}
                />
                <datalist id="timezone-options">{TIME_ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist>
                {errors.timezone && <p className="field-error">{errors.timezone}</p>}
                <p className="field-help">Use your local IANA time zone, such as Asia/Kolkata for India. Stored timestamps remain UTC.</p>
                {settings && <p className="field-help">Environment default: {settings.environmentTimeZone}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="settings-date-format">Date format</label>
                <select id="settings-date-format" value={values.dateFormat} onChange={(event) => updateSetting('dateFormat', event.target.value)} disabled={isSaving || isLoading}>
                  <option value="short">Nov 26, 2026</option>
                  <option value="numeric">11/26/2026</option>
                  <option value="dayFirst">26/11/2026</option>
                  <option value="iso">2026-11-26</option>
                </select>
                {errors.dateFormat && <p className="field-error">{errors.dateFormat}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="settings-time-format">Time format</label>
                <select id="settings-time-format" value={values.timeFormat} onChange={(event) => updateSetting('timeFormat', event.target.value)} disabled={isSaving || isLoading}>
                  <option value="12h">12-hour (2:30 PM)</option>
                  <option value="24h">24-hour (14:30)</option>
                </select>
                {errors.timeFormat && <p className="field-error">{errors.timeFormat}</p>}
              </div>
            </div>
            {settings && (
              <div className="format-preview">
                <span>Preview</span>
                <time dateTime={new Date().toISOString()}>{formatDateTime(new Date().toISOString())}</time>
              </div>
            )}
            <TurnstileField
              ref={settingsTurnstile}
              error={errors.captcha}
              disabled={isSaving || isLoading}
              onErrorClear={() => setErrors((current) => ({ ...current, captcha: '' }))}
            />
            <div className="settings-actions"><button type="submit" className="button button-primary" disabled={isSaving || isLoading}>{isSaving ? <span className="spinner" /> : <Icon name="check" size={17} />}{isSaving ? 'Saving…' : 'Save display settings'}</button></div>
          </form>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon"><Icon name="mail" size={20} /></span>
            <div><h2>Email configuration</h2><p>SMTP credentials stay in the server environment.</p></div>
          </div>
          <div className={`status-banner ${settings?.smtpConfigured ? 'status-success' : 'status-warning'}`}>
            <Icon name={settings?.smtpConfigured ? 'check' : 'alert'} size={17} />
            <span>{settings?.smtpConfigured ? 'SMTP is configured.' : 'SMTP is not configured.'}</span>
          </div>
          {!settings?.smtpConfigured && <p className="settings-help">Set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code>, and <code>SMTP_FROM</code> in the backend <code>.env</code>, then restart the API.</p>}
          <form onSubmit={handleEmailTest} noValidate>
            <div className="form-field">
              <label htmlFor="email-test-recipient">Send a test email to</label>
              <input id="email-test-recipient" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailError(''); setEmailTurnstileError(''); setEmailMessage(''); }} placeholder="admin@company.com" maxLength={255} disabled={isSendingEmail} />
              {emailError && <p className="field-error">{emailError}</p>}
            </div>
            <TurnstileField
              ref={emailTurnstile}
              error={emailTurnstileError}
              disabled={isSendingEmail}
              onErrorClear={() => setEmailTurnstileError('')}
            />
            <div className="settings-actions"><button type="submit" className="button button-secondary" disabled={isSendingEmail || !settings?.smtpConfigured}>{isSendingEmail ? <span className="spinner" /> : <Icon name="mail" size={17} />}{isSendingEmail ? 'Sending…' : 'Send test email'}</button></div>
            {emailMessage && <p className="settings-success" role="status"><Icon name="check" size={15} />{emailMessage}</p>}
          </form>
        </article>

        <article className="settings-card">
          <div className="settings-card-heading">
            <span className="settings-icon"><Icon name="shield" size={20} /></span>
            <div><h2>Security and URLs</h2><p>Browser and integration protections.</p></div>
          </div>
          <dl className="settings-status-list">
            <div><dt><Icon name="shield" size={16} />Cloudflare Turnstile</dt><dd><span className="status-dot" />{settings?.turnstileEnabled ? 'Enabled on browser forms' : 'Not configured'}</dd></div>
            <div><dt><Icon name="activity" size={16} />Rate limits</dt><dd><span className="status-dot" />Enabled</dd></div>
            <div><dt><Icon name="link" size={16} />Public app URL</dt><dd className="settings-url">{settings?.publicAppUrl || 'Loading…'}</dd></div>
            <div><dt><Icon name="image" size={16} />Image policy</dt><dd>{settings?.imagePolicy?.guidance || 'JPEG, PNG, or WebP · maximum 2 MB.'}</dd></div>
          </dl>
          <p className="settings-help">Google Forms imports use a private Bearer token instead of browser Turnstile. Configure the public URL with <code>PUBLIC_APP_URL</code> for shared links.</p>
        </article>

        <article className="settings-card settings-card-wide">
          <div className="settings-card-heading">
            <span className="settings-icon"><Icon name="download" size={20} /></span>
            <div><h2>Backup and export</h2><p>Download secret-free JSON or CSV snapshots of up to 10,000 rows per dataset.</p></div>
          </div>
          <div className="backup-controls">
            <div className="form-field"><label htmlFor="backup-dataset">Dataset</label><select id="backup-dataset" value={dataset} onChange={(event) => { const next = event.target.value; setDataset(next); if (next === 'all') setFormat('json'); }}><option value="all">Full backup (JSON)</option><option value="employees">Employees</option><option value="audit">Activity log</option><option value="logs">System logs</option></select></div>
            <div className="form-field"><label htmlFor="backup-format">Format</label><select id="backup-format" value={format} onChange={(event) => setFormat(event.target.value)} disabled={dataset === 'all'}><option value="json">JSON</option><option value="csv">CSV</option></select></div>
            <button type="button" className="button button-primary" onClick={handleBackup} disabled={isExporting}>{isExporting ? <span className="spinner" /> : <Icon name="download" size={17} />}{isExporting ? 'Preparing…' : 'Download backup'}</button>
          </div>
          {backupMessage && <p className="settings-help" role="status">{backupMessage}</p>}
          <div className="onboarding-notice"><Icon name="lock" size={17} /><p>Exports exclude accounts, password hashes, sessions, SMTP credentials, Turnstile secrets, and webhook tokens. Employee photo files are not included.</p></div>
        </article>

        <article className="settings-card settings-card-wide">
          <div className="settings-card-heading settings-card-heading-actions">
            <span className="settings-icon"><Icon name="server" size={20} /></span>
            <div><h2>System logs</h2><p>Recent operational errors and server events. Permanent business history remains in Activity log.</p></div>
            <div className="log-controls">
              <select value={logLevel} onChange={(event) => setLogLevel(event.target.value)} aria-label="Filter system logs"><option value="">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="info">Information</option></select>
              <button type="button" className="button button-secondary button-small" onClick={loadLogs} disabled={isLoadingLogs}><Icon name="refresh" size={15} />Refresh</button>
            </div>
          </div>
          {logsError && <div className="alert alert-error" role="alert">{logsError}</div>}
          {isLoadingLogs && logs.length === 0 ? <div className="logs-empty">Loading system logs…</div> : logs.length === 0 ? <div className="logs-empty"><Icon name="check" size={20} />No matching system events. The application is running normally.</div> : (
            <div className="system-log-list">
              {logs.map((log) => (
                <div className={`system-log system-log-${log.level}`} key={log.id}>
                  <span className="log-level">{log.level}</span>
                  <div><strong>{log.event}</strong><p>{log.message}</p><span>{log.ip_address || 'No IP address'} · <time dateTime={log.created_at}>{formatDateTime(log.created_at)}</time></span></div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
