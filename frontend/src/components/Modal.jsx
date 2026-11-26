import { useEffect, useId, useRef } from 'react';
import Icon from './Icon.jsx';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function Modal({
  title,
  description,
  onClose,
  children,
  size = 'medium',
  className = '',
  icon,
  iconTone = 'primary',
  accent = false,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const firstField = dialogRef.current?.querySelector('[data-autofocus]');
    const firstControl = dialogRef.current?.querySelector(FOCUSABLE_SELECTOR);
    (firstField || firstControl)?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const controls = Array.from(
        dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
      );
      const first = controls[0];
      const last = controls[controls.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className={`modal modal-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {accent && <div className="modal-accent" aria-hidden="true" />}
        <header className={`modal-header${icon ? ' modal-header-with-icon' : ''}`}>
          {icon && (
            <span className={`modal-icon modal-icon-${iconTone}`} aria-hidden="true">
              <Icon name={icon} size={24} />
            </span>
          )}
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            type="button"
            className="button button-icon button-ghost modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="x" size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
