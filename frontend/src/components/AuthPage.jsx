import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { clearDraft, readDraft, writeDraft } from '../utils/drafts.js';
import TurnstileField from './TurnstileField.jsx';
import Icon from './Icon.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_VALUES = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function AuthPage({ initialMode = 'login', onboarding = false, completed = false }) {
  const { signIn, register, sessionError, refreshSession } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const draftKey = `auth.${onboarding ? 'onboarding' : 'standard'}`;
  const [values, setValues] = useState(() => readDraft(draftKey, EMPTY_VALUES));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const turnstileRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const isRegistering = mode === 'register';
  const isOnboardingRegister = onboarding && isRegistering;
  const showCompletion = onboarding && (isComplete || completed);

  useEffect(() => {
    writeDraft(draftKey, values, ['password', 'confirmPassword']);
  }, [draftKey, values]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setValues((current) => ({ ...current, password: '', confirmPassword: '' }));
    setErrors({});
    setSubmitError('');
    setShowPassword(false);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setSubmitError('');
  };

  const validate = () => {
    const nextErrors = {};

    if (isRegistering && values.name.trim().length < 2) {
      nextErrors.name = 'Name must be at least 2 characters.';
    }

    if (!EMAIL_PATTERN.test(values.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!values.password) {
      nextErrors.password = 'Password is required.';
    } else if (isRegistering) {
      if (values.password.length < 8) {
        nextErrors.password = 'Password must be at least 8 characters.';
      } else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) {
        nextErrors.password = 'Use at least one letter and one number.';
      }
    }

    if (isRegistering && values.password !== values.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validate();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      document.getElementById(`auth-${Object.keys(nextErrors)[0]}`)?.focus();
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setErrors((current) => ({ ...current, captcha: '' }));

    try {
      const turnstile = turnstileRef.current?.getValue() || {};
      if (isRegistering) {
        await register({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          registrationSource: onboarding ? 'onboarding' : 'standard',
          ...turnstile,
        });
      } else {
        await signIn({ email: values.email.trim(), password: values.password, ...turnstile });
      }

      clearDraft(draftKey);
      if (onboarding) {
        window.history.replaceState({}, '', '/onboarding/complete');
        setIsComplete(true);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        turnstileRef.current?.refresh();
      }
      setSubmitError(error.message || 'The account could not be accessed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldProps = (name) => ({
    id: `auth-${name}`,
    name,
    value: values[name],
    onChange: handleChange,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `auth-${name}-error` : undefined,
    disabled: isSubmitting,
  });

  return (
    <div className="auth-page">
      <section className="auth-showcase" aria-label="PeopleHub overview">
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="users" size={21} /></span>
          <span>PeopleHub</span>
          <span className="portal-badge">Portal</span>
        </div>

        <div className="auth-showcase-content">
          <p className="auth-eyebrow">Your people, organized</p>
          <h1>A better way to manage your employee directory.</h1>
          <p className="auth-showcase-description">
            Sign in to search employee records, keep team details current, and manage your directory from one secure workspace.
          </p>

          <div className="auth-feature-list">
            <div>
              <span><Icon name="check" size={17} /></span>
              <p><strong>One trusted directory</strong><small>All employee details in one place.</small></p>
            </div>
            <div>
              <span><Icon name="search" size={17} /></span>
              <p><strong>Find people quickly</strong><small>Search, filter, and sort your records.</small></p>
            </div>
            <div>
              <span><Icon name="shield" size={17} /></span>
              <p><strong>Private by default</strong><small>Secure sessions protect your workspace.</small></p>
            </div>
          </div>
        </div>

        <p className="auth-showcase-footer">PeopleHub · Employee Directory</p>
      </section>

      <main className="auth-panel">
        <div className="auth-mobile-brand">
          <span className="brand-mark"><Icon name="users" size={19} /></span>
          <span>PeopleHub</span>
        </div>

        <div className="auth-card">
          {!showCompletion && (
            <>
              <p className="auth-eyebrow">{isOnboardingRegister ? 'Employee onboarding' : isRegistering ? 'Join the workspace' : 'Welcome back'}</p>
              <h2>{isOnboardingRegister ? 'Join PeopleHub' : isRegistering ? 'Create your account' : 'Sign in to PeopleHub'}</h2>
              <p className="auth-intro">
                {isOnboardingRegister
                  ? 'Create your member account for PeopleHub onboarding.'
                  : isRegistering
                    ? 'Create your account to sign in to PeopleHub.'
                    : 'Enter your account details to continue to PeopleHub.'}
              </p>
            </>
          )}

          {!showCompletion && sessionError && (
            <div className="alert alert-error auth-session-error" role="alert">
              <Icon name="alert" size={18} />
              <div>
                <span>{sessionError}</span>
                <button type="button" onClick={refreshSession}>Retry session check</button>
              </div>
            </div>
          )}

          {showCompletion ? (
            <div className="onboarding-success" role="status">
              <span className="onboarding-success-icon"><Icon name="check" size={28} /></span>
              <p className="auth-eyebrow">Employee onboarding</p>
              <h2>Your account is ready</h2>
              <p className="auth-intro">
                Your member account has been created. Use the main sign-in page to continue to PeopleHub.
              </p>
              <a className="button button-primary onboarding-signin-link" href="/login">
                Go to sign in
              </a>
            </div>
          ) : (
            <>
              {!onboarding && (
                <div className="auth-tabs" role="group" aria-label="Account access">
                  <button
                    type="button"
                    className={!isRegistering ? 'auth-tab-active' : ''}
                    aria-pressed={!isRegistering}
                    onClick={() => switchMode('login')}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={isRegistering ? 'auth-tab-active' : ''}
                    aria-pressed={isRegistering}
                    onClick={() => switchMode('register')}
                  >
                    Create account
                  </button>
                </div>
              )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {(submitError || errors.form) && (
              <div className="alert alert-error auth-submit-error" role="alert">
                <Icon name="alert" size={18} />
                <span>{submitError || errors.form}</span>
              </div>
            )}

            {isRegistering && (
              <div className="auth-field">
                <label htmlFor="auth-name">Full name</label>
                <div className="auth-input-wrap">
                  <Icon name="user" size={18} />
                  <input
                    {...fieldProps('name')}
                    type="text"
                    maxLength={100}
                    placeholder="Avery Morgan"
                    autoComplete="name"
                    data-autofocus
                  />
                </div>
                {errors.name && <p className="field-error" id="auth-name-error">{errors.name}</p>}
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email address</label>
              <div className="auth-input-wrap">
                <Icon name="mail" size={18} />
                <input
                  {...fieldProps('email')}
                  type="email"
                  maxLength={255}
                  placeholder="you@company.com"
                  autoComplete="email"
                  data-autofocus={!isRegistering ? '' : undefined}
                />
              </div>
              {errors.email && <p className="field-error" id="auth-email-error">{errors.email}</p>}
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap">
                <Icon name="lock" size={18} />
                <input
                  {...fieldProps('password')}
                  type={showPassword ? 'text' : 'password'}
                  maxLength={128}
                  placeholder={isRegistering ? 'At least 8 characters' : 'Enter your password'}
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isSubmitting}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
              {errors.password
                ? <p className="field-error" id="auth-password-error">{errors.password}</p>
                : isRegistering && <p className="field-help">Use 8 or more characters with a letter and a number.</p>}
            </div>

            {isRegistering && (
              <div className="auth-field">
                <label htmlFor="auth-confirmPassword">Confirm password</label>
                <div className="auth-input-wrap">
                  <Icon name="lock" size={18} />
                  <input
                    {...fieldProps('confirmPassword')}
                    type={showPassword ? 'text' : 'password'}
                    maxLength={128}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="field-error" id="auth-confirmPassword-error">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            <TurnstileField
              ref={turnstileRef}
              error={errors.captcha}
              disabled={isSubmitting}
              onErrorClear={() => setErrors((current) => ({ ...current, captcha: '' }))}
            />

            <button type="submit" className="button button-primary auth-submit" disabled={isSubmitting}>
              {isSubmitting
                ? <span className="spinner" aria-hidden="true" />
                : <Icon name={isRegistering ? 'check' : 'lock'} size={18} />}
              {isSubmitting
                ? isRegistering ? 'Creating account…' : 'Signing in…'
                : isRegistering ? 'Create account' : 'Sign in'}
            </button>
          </form>

              {!onboarding && (
                <p className="auth-switch">
                  {isRegistering ? 'Already have an account?' : 'New to PeopleHub?'}{' '}
                  <button type="button" onClick={() => switchMode(isRegistering ? 'login' : 'register')}>
                    {isRegistering ? 'Sign in' : 'Create an account'}
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
