import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api.js';
import {
  createOnboardingApplication,
  getOnboardingApplication,
  submitOnboardingApplication,
  updateOnboardingApplication,
  uploadOnboardingDocument,
} from '../api.js';
import { clearDraft, readDraft, writeDraft } from '../utils/drafts.js';
import Icon from './Icon.jsx';
import TurnstileField from './TurnstileField.jsx';

const DRAFT_KEY = 'onboarding.direct';
const APPLICATION_KEY = 'peoplehub.onboarding.application';
const EMPTY_PROFILE = {
  name: '',
  email: '',
  phone: '',
  department: '',
  designation: '',
  joining_date: '',
};
const DOCUMENTS = [
  { type: 'aadhaar', label: 'Aadhaar', help: 'Upload the front and back in one file.' },
  { type: 'pan', label: 'PAN card', help: 'Upload a clear copy of your PAN card.' },
  { type: 'bank_book', label: 'Bank book / statement', help: 'Upload a bank passbook or account statement.' },
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatBytes(bytes) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readApplicationId() {
  try {
    return window.sessionStorage.getItem(APPLICATION_KEY) || '';
  } catch {
    return '';
  }
}

export default function OnboardingPage({ completed = false }) {
  const [applicationId, setApplicationId] = useState(readApplicationId);
  const [profile, setProfile] = useState(() => readDraft(DRAFT_KEY, EMPTY_PROFILE));
  const [documents, setDocuments] = useState({});
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [uploading, setUploading] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(completed);
  const [isLoading, setIsLoading] = useState(Boolean(applicationId));
  const turnstileRef = useRef(null);

  useEffect(() => {
    writeDraft(DRAFT_KEY, profile);
  }, [profile]);

  useEffect(() => {
    if (!applicationId) {
      return undefined;
    }

    const controller = new AbortController();
    setIsLoading(true);
    getOnboardingApplication(applicationId, { signal: controller.signal })
      .then((response) => {
        setProfile((current) => ({ ...current, ...response.data.profile }));
        setDocuments(Object.fromEntries(response.data.documents.map((document) => [document.documentType, document])));
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSubmitError(error.message || 'The saved onboarding draft could not be loaded.');
          if (error.status === 404) {
            try {
              window.sessionStorage.removeItem(APPLICATION_KEY);
            } catch {
              // Storage is optional.
            }
            setApplicationId('');
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [applicationId]);

  const updateProfile = (event) => {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setSubmitError('');
  };

  const validateProfile = () => {
    const nextErrors = {};
    if (profile.name.trim().length < 2) nextErrors.name = 'Name must be at least 2 characters.';
    if (!EMAIL_PATTERN.test(profile.email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (profile.phone.replace(/\D/g, '').length < 7) nextErrors.phone = 'Enter a valid phone number.';
    if (!profile.department.trim()) nextErrors.department = 'Department is required.';
    if (!profile.designation.trim()) nextErrors.designation = 'Designation is required.';
    if (!profile.joining_date) nextErrors.joining_date = 'Joining date is required.';
    return nextErrors;
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextErrors = validateProfile();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = applicationId
        ? await updateOnboardingApplication(applicationId, profile)
        : await createOnboardingApplication(profile);
      const id = response.data.applicationId;
      setApplicationId(id);
      try {
        window.sessionStorage.setItem(APPLICATION_KEY, id);
      } catch {
        // The HttpOnly draft cookie still preserves the application.
      }
      setStep(2);
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      setSubmitError(error.message || 'Your profile could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDocument = async (type, file) => {
    if (!file) return;
    setUploading(type);
    setSubmitError('');
    setErrors((current) => ({ ...current, [type]: '' }));

    try {
      const response = await uploadOnboardingDocument(applicationId, type, file);
      setDocuments((current) => ({ ...current, [type]: response.data }));
    } catch (error) {
      if (error instanceof ApiError) setErrors((current) => ({ ...current, [type]: error.message }));
      setSubmitError(error.message || 'The document could not be uploaded.');
    } finally {
      setUploading('');
    }
  };

  const allDocumentsUploaded = DOCUMENTS.every(({ type }) => documents[type]?.uploaded);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      nextErrors.password = 'Use at least 8 characters with a letter and a number.';
    }
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    if (!accepted) nextErrors.accepted = 'Confirm that your information and documents are accurate.';
    if (!allDocumentsUploaded) nextErrors.documents = 'Upload all three required documents.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setErrors((current) => ({ ...current, captcha: '' }));

    try {
      const turnstile = turnstileRef.current?.getValue() || {};
      if (!turnstile['cf-turnstile-response']) {
        setErrors((current) => ({ ...current, captcha: 'Complete the security check before submitting.' }));
        return;
      }

      await submitOnboardingApplication(applicationId, { password, confirmPassword, ...turnstile });
      clearDraft(DRAFT_KEY);
      try {
        window.sessionStorage.removeItem(APPLICATION_KEY);
      } catch {
        // Submission is already complete on the server.
      }
      setIsComplete(true);
      window.history.replaceState({}, '', '/onboarding/complete');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        turnstileRef.current?.refresh();
      }
      setSubmitError(error.message || 'Your onboarding could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isComplete) {
    return (
      <div className="auth-page">
        <section className="auth-showcase" aria-label="PeopleHub overview">
          <div className="auth-brand">
            <span className="brand-mark"><Icon name="users" size={21} /></span>
            <span>PeopleHub</span>
            <span className="portal-badge">Portal</span>
          </div>
          <div className="auth-showcase-content">
            <p className="auth-eyebrow">Employee onboarding</p>
            <h1>Your application is with our people team.</h1>
            <p className="auth-showcase-description">An administrator will verify your documents and approve your account.</p>
          </div>
        </section>
        <main className="auth-panel">
          <div className="auth-card onboarding-success" role="status">
            <span className="onboarding-success-icon"><Icon name="check" size={28} /></span>
            <p className="auth-eyebrow">Submitted successfully</p>
            <h2>Waiting for administrator approval</h2>
            <p className="auth-intro">Sign-in stays blocked until your Aadhaar, PAN, and bank documents are verified and your onboarding is approved.</p>
            <a className="button button-primary onboarding-signin-link" href="/login">Go to sign in</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page onboarding-page">
      <section className="auth-showcase" aria-label="PeopleHub onboarding overview">
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="users" size={21} /></span>
          <span>PeopleHub</span>
          <span className="portal-badge">Portal</span>
        </div>
        <div className="auth-showcase-content">
          <p className="auth-eyebrow">Employee onboarding</p>
          <h1>Join your team with a secure, paperless start.</h1>
          <p className="auth-showcase-description">Complete your profile, upload private identity documents, and submit your application for administrator review.</p>
          <div className="auth-feature-list">
            <div><span><Icon name="user" size={17} /></span><p><strong>Your profile</strong><small>Employee and joining details.</small></p></div>
            <div><span><Icon name="upload" size={17} /></span><p><strong>Private documents</strong><small>Encrypted Cloudinary storage.</small></p></div>
            <div><span><Icon name="shield" size={17} /></span><p><strong>Admin verification</strong><small>Approval before account access.</small></p></div>
          </div>
        </div>
        <p className="auth-showcase-footer">PeopleHub · Secure employee onboarding</p>
      </section>

      <main className="auth-panel">
        <div className="auth-mobile-brand"><span className="brand-mark"><Icon name="users" size={19} /></span><span>PeopleHub</span></div>
        <div className="auth-card onboarding-card">
          <ol className="onboarding-steps" aria-label="Onboarding progress">
            {['Profile', 'Documents', 'Account'].map((label, index) => (
              <li key={label} className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-complete' : ''}>
                <span>{step > index + 1 ? <Icon name="check" size={14} /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>

          {isLoading ? (
            <div className="onboarding-loading" role="status"><span className="spinner" aria-hidden="true" />Loading your saved application…</div>
          ) : (
            <>
              <p className="auth-eyebrow">Step {step} of 3</p>
              <h2>{step === 1 ? 'Employee details' : step === 2 ? 'Required documents' : 'Create your sign-in'}</h2>
              <p className="auth-intro">
                {step === 1
                  ? 'Enter the details your administrator will review.'
                  : step === 2
                    ? 'PDF, DOC, DOCX, JPG, PNG, or WebP. Maximum 5 MB per document.'
                    : 'Choose a password. You can sign in only after administrator approval.'}
              </p>

              {(submitError || errors.form) && (
                <div className="alert alert-error auth-submit-error" role="alert"><Icon name="alert" size={18} /><span>{submitError || errors.form}</span></div>
              )}

              {step === 1 && (
                <form className="auth-form onboarding-profile-form" onSubmit={saveProfile} noValidate>
                  <div className="onboarding-field-grid">
                    <div className="auth-field">
                      <label htmlFor="onboarding-name">Full name</label>
                      <input id="onboarding-name" name="name" value={profile.name} onChange={updateProfile} maxLength={100} autoComplete="name" disabled={isSubmitting} />
                      {errors.name && <p className="field-error">{errors.name}</p>}
                    </div>
                    <div className="auth-field">
                      <label htmlFor="onboarding-email">Email address</label>
                      <input id="onboarding-email" name="email" type="email" value={profile.email} onChange={updateProfile} maxLength={255} autoComplete="email" disabled={isSubmitting} />
                      {errors.email && <p className="field-error">{errors.email}</p>}
                    </div>
                    <div className="auth-field">
                      <label htmlFor="onboarding-phone">Phone number</label>
                      <input id="onboarding-phone" name="phone" value={profile.phone} onChange={updateProfile} maxLength={20} autoComplete="tel" disabled={isSubmitting} />
                      {errors.phone && <p className="field-error">{errors.phone}</p>}
                    </div>
                    <div className="auth-field">
                      <label htmlFor="onboarding-department">Department</label>
                      <input id="onboarding-department" name="department" value={profile.department} onChange={updateProfile} maxLength={100} disabled={isSubmitting} />
                      {errors.department && <p className="field-error">{errors.department}</p>}
                    </div>
                    <div className="auth-field">
                      <label htmlFor="onboarding-designation">Designation</label>
                      <input id="onboarding-designation" name="designation" value={profile.designation} onChange={updateProfile} maxLength={100} disabled={isSubmitting} />
                      {errors.designation && <p className="field-error">{errors.designation}</p>}
                    </div>
                    <div className="auth-field">
                      <label htmlFor="onboarding-joining-date">Joining date</label>
                      <input id="onboarding-joining-date" name="joining_date" type="date" value={profile.joining_date} onChange={updateProfile} disabled={isSubmitting} />
                      {errors.joining_date && <p className="field-error">{errors.joining_date}</p>}
                    </div>
                  </div>
                  <button type="submit" className="button button-primary auth-submit" disabled={isSubmitting}>
                    {isSubmitting ? <span className="spinner" aria-hidden="true" /> : <Icon name="arrowRight" size={18} />}
                    {isSubmitting ? 'Saving profile…' : 'Continue to documents'}
                  </button>
                </form>
              )}

              {step === 2 && (
                <div className="onboarding-documents">
                  {errors.documents && <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{errors.documents}</span></div>}
                  {DOCUMENTS.map(({ type, label, help }) => {
                    const document = documents[type];
                    const isUploading = uploading === type;
                    return (
                      <div className={`document-upload-card${document?.uploaded ? ' is-uploaded' : ''}`} key={type}>
                        <span className="document-upload-icon"><Icon name={document?.uploaded ? 'check' : 'upload'} size={20} /></span>
                        <div className="document-upload-copy">
                          <strong>{label}</strong>
                          <small>{document?.uploaded ? `${document.format.toUpperCase()} · ${formatBytes(document.bytes)} · Uploaded` : help}</small>
                          {errors[type] && <p className="field-error">{errors[type]}</p>}
                        </div>
                        <label className={`button button-secondary button-small${isUploading ? ' is-disabled' : ''}`}>
                          {isUploading ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" size={15} />}
                          {isUploading ? 'Uploading…' : document?.uploaded ? 'Replace' : 'Choose file'}
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                            disabled={isSubmitting || Boolean(uploading)}
                            onChange={(event) => {
                              handleDocument(type, event.target.files?.[0]);
                              event.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    );
                  })}
                  <div className="member-notice"><Icon name="lock" size={18} /><span>Documents are private. Only administrators can view or download them.</span></div>
                  <div className="onboarding-actions">
                    <button type="button" className="button button-secondary" onClick={() => setStep(1)} disabled={isSubmitting}>Back</button>
                    <button type="button" className="button button-primary" onClick={() => setStep(3)} disabled={!allDocumentsUploaded || Boolean(uploading)}>
                      Continue to account <Icon name="arrowRight" size={18} />
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                  <div className="auth-field">
                    <label htmlFor="onboarding-password">Password</label>
                    <div className="auth-input-wrap">
                      <Icon name="lock" size={18} />
                      <input id="onboarding-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: '' })); }} maxLength={72} autoComplete="new-password" disabled={isSubmitting} />
                      <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} /></button>
                    </div>
                    {errors.password ? <p className="field-error">{errors.password}</p> : <p className="field-help">Use 8 or more characters with a letter and a number.</p>}
                  </div>
                  <div className="auth-field">
                    <label htmlFor="onboarding-confirm-password">Confirm password</label>
                    <input id="onboarding-confirm-password" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setErrors((current) => ({ ...current, confirmPassword: '' })); }} maxLength={72} autoComplete="new-password" disabled={isSubmitting} />
                    {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
                  </div>
                  <label className="onboarding-consent">
                    <input type="checkbox" checked={accepted} onChange={(event) => { setAccepted(event.target.checked); setErrors((current) => ({ ...current, accepted: '' })); }} disabled={isSubmitting} />
                    <span>I confirm that my profile and identity documents are accurate and authorize administrator verification.</span>
                  </label>
                  {errors.accepted && <p className="field-error">{errors.accepted}</p>}
                  <TurnstileField ref={turnstileRef} error={errors.captcha} disabled={isSubmitting} onErrorClear={() => setErrors((current) => ({ ...current, captcha: '' }))} />
                  <div className="onboarding-actions">
                    <button type="button" className="button button-secondary" onClick={() => setStep(2)} disabled={isSubmitting}>Back</button>
                    <button type="submit" className="button button-primary" disabled={isSubmitting}>
                      {isSubmitting ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={18} />}
                      {isSubmitting ? 'Submitting…' : 'Submit for approval'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
