import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, getOnboardingConfig, saveOnboardingFormLink } from '../api.js';
import { clearDraft, readDraft, writeDraft } from '../utils/drafts.js';
import { buildApiUrl } from '../utils/url.js';
import TurnstileField from './TurnstileField.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

const STORAGE_KEY = 'onboardingForm';

function isGoogleFormUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ((url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'))
        || url.hostname === 'forms.gle');
  } catch {
    return false;
  }
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the selection-based copy path when clipboard permission is denied.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('Clipboard access is unavailable.');
  }
}

function buildAppsScript(webhookUrl, token) {
  return `const WEBHOOK_URL = ${JSON.stringify(webhookUrl)};
const WEBHOOK_TOKEN = ${JSON.stringify(token)};

function onPeopleHubFormSubmit(event) {
  const response = event.response;
  if (!response) {
    throw new Error('Missing Google Form response.');
  }

  const answers = {};
  response.getItemResponses().forEach(function (itemResponse) {
    const title = itemResponse.getItem().getTitle().trim().toLowerCase();
    answers[title] = itemResponse.getResponse();
  });

  const joiningDate = answers['joining date'];
  const parsedDate = joiningDate ? new Date(joiningDate) : null;
  const normalizedDate = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(joiningDate || '').trim();

  const payload = {
    responseId: response.getId(),
    employee: {
      name: String(answers['name'] || '').trim(),
      email: String(answers['email'] || '').trim(),
      phone: String(answers['phone'] || '').trim(),
      department: String(answers['department'] || '').trim(),
      designation: String(answers['designation'] || '').trim(),
      salary: String(answers['salary'] || '').replace(/[,$\\s]/g, ''),
      joining_date: normalizedDate
    }
  };

  const result = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + WEBHOOK_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = result.getResponseCode();
  if (status < 200 || status >= 300) {
    const message = 'PeopleHub import failed (' + status + '): ' + result.getContentText();
    console.error(message);
    throw new Error(message);
  }
}

function setupPeopleHubOnboarding() {
  const form = FormApp.getActiveForm();
  if (!form) {
    throw new Error('Open the script editor from the Google Form menu, then run setup again.');
  }

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onPeopleHubFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onPeopleHubFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();
}`;
}

export default function OnboardingModal({ onClose }) {
  const [formUrl, setFormUrl] = useState(() => readDraft(STORAGE_KEY, { url: '' }).url || '');
  const [savedUrl, setSavedUrl] = useState('');
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const turnstileRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadConfig() {
      setIsLoading(true);
      setLoadError('');

      try {
        const response = await getOnboardingConfig({ signal: controller.signal });
        setConfig(response.data);
        setSavedUrl(response.data.formUrl || '');
        setFormUrl(response.data.formUrl || readDraft(STORAGE_KEY, { url: '' }).url || '');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError(error.message || 'The onboarding integration could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadConfig();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    writeDraft(STORAGE_KEY, { url: formUrl });
  }, [formUrl]);

  useEffect(() => {
    if (!copiedKey) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopiedKey(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [copiedKey]);

  const webhookUrl = useMemo(() => {
    if (!config) {
      return '';
    }

    return buildApiUrl(config.webhookPath);
  }, [config]);

  const appsScript = useMemo(
    () => config ? buildAppsScript(webhookUrl, config.token) : '',
    [config, webhookUrl],
  );

  const handleSave = async (event) => {
    event.preventDefault();
    const normalizedUrl = formUrl.trim();
    setErrors({});
    setFormError('');

    if (!isGoogleFormUrl(normalizedUrl)) {
      setErrors({ url: 'Paste a valid https://docs.google.com/forms/ or https://forms.gle/ link.' });
      return;
    }

    setIsSaving(true);
    try {
      const response = await saveOnboardingFormLink(normalizedUrl, turnstileRef.current?.getValue() || {});
      setSavedUrl(response.data.formUrl);
      setFormUrl(response.data.formUrl);
      clearDraft(STORAGE_KEY);
      turnstileRef.current?.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        turnstileRef.current?.refresh();
      }
      setFormError(error.message || 'The Google Form link could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = useCallback(async (value, key) => {
    try {
      await copyText(value);
      setCopiedKey(key);
      setFormError('');
    } catch {
      setFormError('Copy was blocked by the browser. Select the text and copy it manually.');
    }
  }, []);

  return (
    <Modal
      title="Employee onboarding"
      description="Share a Google Form and add each valid submission to the employee directory automatically."
      onClose={onClose}
      className="onboarding-modal"
      icon="form"
      accent
    >
      <div className="modal-body onboarding-body">
        {loadError && (
          <div className="alert alert-error form-alert" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <strong>Integration unavailable</strong>
              <span>{loadError} Run <code>npm run db:setup</code> and restart the API if the database was just upgraded.</span>
            </div>
          </div>
        )}

        <section className="onboarding-section" aria-labelledby="form-link-title">
          <div className="onboarding-section-heading">
            <span className="onboarding-step">1</span>
            <div>
              <h3 id="form-link-title">Create and save your Google Form</h3>
              <p>Use the seven required questions below, then paste the form link.</p>
            </div>
            <a
              className="button button-secondary button-small"
              href="https://docs.google.com/forms/create"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="externalLink" size={15} />
              Create form
            </a>
          </div>

          <div className="onboarding-field-grid">
            {(config?.fields || []).map((field) => (
              <div className="onboarding-field" key={field.key}>
                <Icon name="check" size={15} />
                <span>{field.label}</span>
                <small>{field.type}</small>
              </div>
            ))}
            {isLoading && <p className="onboarding-loading">Loading required fields…</p>}
          </div>

          <form className="onboarding-link-form" onSubmit={handleSave} noValidate>
            <div className="form-field">
              <label htmlFor="google-form-url">Google Form link</label>
              <input
                id="google-form-url"
                type="url"
                value={formUrl}
                onChange={(event) => {
                  setFormUrl(event.target.value);
                  setFormError('');
                  setErrors((current) => ({ ...current, url: '', captcha: '' }));
                }}
                placeholder="https://docs.google.com/forms/d/..."
                aria-invalid={Boolean(errors.url)}
                aria-describedby={errors.url ? 'onboarding-form-error' : undefined}
                disabled={isSaving}
                data-autofocus
              />
              {errors.url && <p className="field-error" id="onboarding-form-error">{errors.url}</p>}
            </div>
            <button type="submit" className="button button-secondary" disabled={isSaving}>
              {isSaving ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={17} />}
              {isSaving ? 'Saving…' : 'Save link'}
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!savedUrl}
              onClick={() => handleCopy(savedUrl, 'form')}
            >
              <Icon name={copiedKey === 'form' ? 'check' : 'copy'} size={17} />
              {copiedKey === 'form' ? 'Copied' : 'Copy form link'}
            </button>
          </form>
          {formError && <div className="alert alert-error form-alert" role="alert"><Icon name="alert" size={17} />{formError}</div>}
          <TurnstileField
            ref={turnstileRef}
            error={errors.captcha}
            disabled={isSaving}
            onErrorClear={() => setErrors((current) => ({ ...current, captcha: '' }))}
          />
          {savedUrl && (
            <p className="onboarding-saved" role="status">
              <Icon name="check" size={15} />
              Link saved securely in PeopleHub. Send only the form link to employees.
            </p>
          )}
        </section>

        <section className="onboarding-section" aria-labelledby="script-title">
          <div className="onboarding-section-heading">
            <span className="onboarding-step">2</span>
            <div>
              <h3 id="script-title">Connect the form to PeopleHub</h3>
              <p>Open the form&apos;s three-dot menu, choose <strong>Script editor</strong>, and paste this code.</p>
            </div>
          </div>

          <ol className="onboarding-instructions">
            <li>Replace the editor contents with the script below and save it.</li>
            <li>Select <code>setupPeopleHubOnboarding</code> from the function list and choose <strong>Run</strong>.</li>
            <li>Approve Google&apos;s authorization prompt. The trigger will import future submissions.</li>
          </ol>

          <div className="code-field">
            <div className="code-field-header">
              <span>Google Apps Script</span>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={!appsScript}
                onClick={() => handleCopy(appsScript, 'script')}
              >
                <Icon name={copiedKey === 'script' ? 'check' : 'copy'} size={15} />
                {copiedKey === 'script' ? 'Copied' : 'Copy script'}
              </button>
            </div>
            <textarea
              value={appsScript}
              placeholder={isLoading ? 'Loading secure integration script…' : 'The script is unavailable until the integration loads.'}
              readOnly
              spellCheck={false}
              aria-label="Google Apps Script onboarding integration"
            />
          </div>

          <div className="onboarding-webhook">
            <div>
              <span>Secure webhook</span>
              <code>{webhookUrl || 'Loading…'}</code>
            </div>
            <button
              type="button"
              className="button button-icon button-ghost"
              disabled={!webhookUrl}
              onClick={() => handleCopy(webhookUrl, 'webhook')}
              aria-label={copiedKey === 'webhook' ? 'Webhook copied' : 'Copy webhook URL'}
              title={copiedKey === 'webhook' ? 'Copied' : 'Copy webhook URL'}
            >
              <Icon name={copiedKey === 'webhook' ? 'check' : 'copy'} size={17} />
            </button>
          </div>

          <div className="onboarding-notice">
            <Icon name="lock" size={18} />
            <p>
              The script contains a private webhook token. Keep it in the form&apos;s script editor and never send it to employees.
              Valid submissions appear in the directory automatically; duplicate responses and emails are rejected safely.
            </p>
          </div>
        </section>
      </div>
      <footer className="modal-footer onboarding-footer">
        <span>Employees can sign in after their account is created separately.</span>
        <button type="button" className="button button-primary" onClick={onClose}>Done</button>
      </footer>
    </Modal>
  );
}
