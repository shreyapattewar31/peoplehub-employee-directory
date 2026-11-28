import { useEffect } from 'react';
import Icon from './Icon.jsx';

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), 4500);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id]);

  return (
    <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <span className="toast-icon">
        <Icon name={toast.type === 'error' ? 'alert' : 'check'} size={18} />
      </span>
      <span>{toast.message}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export default function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  );
}
