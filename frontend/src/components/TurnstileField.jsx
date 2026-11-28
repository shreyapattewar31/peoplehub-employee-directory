import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const SCRIPT_ID = 'peoplehub-turnstile-script';
const TEST_SITE_KEY = '1x00000000000000000000AA';
let turnstileScriptPromise;

function loadTurnstile() {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID);
    const isNewScript = !script;

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
    }

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      if (!window.turnstile) {
        cleanup();
        script.remove();
        reject(new Error('Turnstile loaded without its browser API.'));
        return;
      }

      cleanup();
      resolve(window.turnstile);
    };

    const handleError = () => {
      cleanup();
      script.remove();
      reject(new Error('The security check script could not be loaded.'));
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    if (isNewScript) {
      document.head.appendChild(script);
    }
  }).catch((error) => {
    turnstileScriptPromise = null;
    throw error;
  });

  return turnstileScriptPromise;
}

const TurnstileField = forwardRef(function TurnstileField({ error, disabled = false, onErrorClear }, ref) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TEST_SITE_KEY : '');
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const tokenRef = useRef('');
  const generationRef = useRef(0);
  const callbacksRef = useRef({ onErrorClear });
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    callbacksRef.current = { onErrorClear };
  }, [onErrorClear]);

  const clearError = useCallback(() => callbacksRef.current.onErrorClear?.(), []);

  const renderWidget = useCallback(async (generation) => {
    if (!siteKey) {
      setStatus('error');
      setLoadError('Cloudflare Turnstile is not configured. Add VITE_TURNSTILE_SITE_KEY and restart the frontend.');
      return;
    }

    if (!containerRef.current || widgetIdRef.current !== null) {
      return;
    }

    setStatus('loading');
    setLoadError('');

    try {
      const turnstile = await loadTurnstile();
      if (generation !== generationRef.current || !containerRef.current) {
        return;
      }

      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        size: 'flexible',
        callback: (nextToken) => {
          tokenRef.current = nextToken;
          setToken(nextToken);
          setStatus('ready');
          setLoadError('');
          clearError();
        },
        'expired-callback': () => {
          tokenRef.current = '';
          setToken('');
          setStatus('loading');
          clearError();
          if (widgetIdRef.current !== null) {
            turnstile.reset(widgetIdRef.current);
          }
        },
        'error-callback': () => {
          tokenRef.current = '';
          setToken('');
          setStatus('error');
          setLoadError('The security check could not be completed. Choose New check to try again.');
          clearError();
        },
        'timeout-callback': () => {
          tokenRef.current = '';
          setToken('');
          setStatus('error');
          setLoadError('The security check timed out. Choose New check to try again.');
          clearError();
        },
      });
    } catch (requestError) {
      if (generation !== generationRef.current) {
        return;
      }
      setStatus('error');
      setLoadError(requestError.message || 'The security check could not be loaded.');
    }
  }, [clearError, siteKey]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    renderWidget(generation);

    return () => {
      generationRef.current += 1;
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      tokenRef.current = '';
      if (widgetId !== null && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [renderWidget]);

  const refresh = useCallback(() => {
    tokenRef.current = '';
    setToken('');
    setLoadError('');
    setStatus('loading');
    clearError();

    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      return;
    }

    renderWidget(generationRef.current);
  }, [clearError, renderWidget]);

  useImperativeHandle(ref, () => ({
    getValue: () => ({ 'cf-turnstile-response': tokenRef.current }),
    refresh,
    focus: () => {
      const target = containerRef.current?.querySelector('input, iframe, button') || containerRef.current;
      target?.focus();
    },
  }), [refresh]);

  return (
    <div className={`turnstile-field${disabled ? ' is-disabled' : ''}`}>
      <div className="turnstile-label-row">
        <label htmlFor={inputId}>Security check</label>
        <button type="button" className="turnstile-refresh" onClick={refresh} disabled={disabled || status === 'loading'}>
          <Icon name="refresh" size={14} />
          New check
        </button>
      </div>
      <div
        ref={containerRef}
        id={inputId}
        className="turnstile-widget"
        tabIndex={-1}
        aria-busy={status === 'loading'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {status === 'loading' && <p className="turnstile-loading">Loading Cloudflare security check…</p>}
      {loadError && <p className="field-error" role="alert">{loadError}</p>}
      {error && <p className="field-error" id={errorId}>{error}</p>}
      <input type="hidden" name="cf-turnstile-response" value={token} readOnly />
    </div>
  );
});

export default TurnstileField;
