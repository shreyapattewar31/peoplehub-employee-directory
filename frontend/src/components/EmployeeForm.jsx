import { useEffect, useRef, useState } from 'react';
import { ApiError, createEmployee, deleteEmployeePhoto, updateEmployee, uploadEmployeePhoto } from '../api.js';
import { clearDraft, readDraft, writeDraft } from '../utils/drafts.js';
import { getInitials } from '../utils/format.js';
import { employeePhotoUrl } from '../utils/url.js';
import { validateEmployee } from '../utils/validation.js';
import TurnstileField from './TurnstileField.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

const EMPTY_EMPLOYEE = {
  name: '',
  email: '',
  phone: '',
  department: '',
  designation: '',
  salary: '',
  joining_date: '',
};

function FormField({ name, label, labelHint, helper, error, children, fullWidth = false }) {
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;

  return (
    <div className={`form-field${fullWidth ? ' form-field-full' : ''}`}>
      <label htmlFor={name}>
        <span className="form-label-text">{label} <span aria-hidden="true">*</span></span>
        {labelHint && <span className="label-hint" aria-hidden="true">{labelHint}</span>}
      </label>
      {children(errorId, Boolean(error), error || helpId)}
      {error ? (
        <p className="field-error" id={errorId}>{error}</p>
      ) : helper ? (
        <p className="field-help" id={helpId}>{helper}</p>
      ) : null}
    </div>
  );
}

export default function EmployeeForm({ employee, departments, onClose, onSaved, onNotify }) {
  const draftKey = `employee.${employee?.id || 'new'}`;
  const defaults = employee
    ? {
        name: employee.name || '',
        email: employee.email || '',
        phone: employee.phone || '',
        department: employee.department || '',
        designation: employee.designation || '',
        salary: String(employee.salary ?? ''),
        joining_date: employee.joining_date || '',
      }
    : EMPTY_EMPLOYEE;
  const [values, setValues] = useState(() => readDraft(draftKey, defaults));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(employee?.photo_url || '');
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const turnstileRef = useRef(null);
  const isBusy = isSaving || isPhotoSaving;

  useEffect(() => {
    writeDraft(draftKey, values);
  }, [draftKey, values]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setSubmitError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateEmployee(values);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstInvalidField = Object.keys(nextErrors)[0];
      document.getElementById(firstInvalidField)?.focus();
      return;
    }

    setIsSaving(true);
    setSubmitError('');
    setErrors((current) => ({ ...current, captcha: '' }));

    const payload = {
      ...values,
      ...(turnstileRef.current?.getValue() || {}),
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      department: values.department.trim(),
      designation: values.designation.trim(),
      salary: Number(values.salary),
    };

    try {
      const response = employee
        ? await updateEmployee(employee.id, payload)
        : await createEmployee(payload);
      clearDraft(draftKey);
      onSaved({ ...response.data, photo_url: photoUrl || null }, employee ? 'edit' : 'create');
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
        setErrors(error.errors);
        turnstileRef.current?.refresh();
      }
      setSubmitError(error.message || 'The employee could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const fieldProps = (name) => ({
    id: name,
    name,
    value: values[name],
    onChange: handleChange,
    'aria-invalid': Boolean(errors[name]),
    disabled: isBusy,
  });

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !employee) return;

    setPhotoError('');
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Choose an image no larger than 2 MB.');
      return;
    }

    setIsPhotoSaving(true);
    try {
      const response = await uploadEmployeePhoto(employee.id, file, turnstileRef.current?.getValue() || {});
      setPhotoUrl(response.data.photo_url);
      onNotify?.('success', 'Employee photo updated.');
      turnstileRef.current?.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.errors.photo) {
        setPhotoError(error.errors.photo);
      }
      setPhotoError((current) => current || error.message || 'The photo could not be uploaded.');
      turnstileRef.current?.refresh();
    } finally {
      setIsPhotoSaving(false);
    }
  };

  const handlePhotoDelete = async () => {
    setIsPhotoSaving(true);
    setPhotoError('');
    try {
      await deleteEmployeePhoto(employee.id, turnstileRef.current?.getValue() || {});
      setPhotoUrl('');
      onNotify?.('success', 'Employee photo removed.');
      turnstileRef.current?.refresh();
    } catch (error) {
      setPhotoError(error.message || 'The photo could not be removed.');
      turnstileRef.current?.refresh();
    } finally {
      setIsPhotoSaving(false);
    }
  };

  return (
    <Modal
      title={employee ? 'Edit employee' : 'Add employee'}
      description={employee
        ? `Update the directory details for ${employee.name}.`
        : 'Enter the employee details to add a new directory record.'}
      onClose={onClose}
      className="modal-form"
      accent
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="modal-body employee-form-body">
          {(submitError || errors.form) && (
            <div className="alert alert-error form-alert" role="alert">
              <Icon name="alert" size={18} />
              <span>{submitError || errors.form}</span>
            </div>
          )}

          <div className="photo-upload-panel">
            <span className={`avatar avatar-${employee?.id || 0}`} aria-hidden="true">
              {photoUrl
                ? <img src={employeePhotoUrl({ photo_url: photoUrl })} alt="" />
                : getInitials(employee?.name || values.name)}
            </span>
            <div className="photo-upload-copy">
              <strong>Employee photo</strong>
              <p>JPEG, PNG, or WebP · maximum 2 MB · 128–4096 px on each side.</p>
              {photoError && <p className="field-error" role="alert">{photoError}</p>}
            </div>
            {employee && (
              <div className="photo-upload-actions">
                <label className="button button-secondary button-small">
                  <Icon name="image" size={15} />
                  {isPhotoSaving ? 'Working…' : photoUrl ? 'Replace' : 'Upload'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} disabled={isBusy} hidden />
                </label>
                {photoUrl && (
                  <button type="button" className="button button-ghost button-small" onClick={handlePhotoDelete} disabled={isBusy}>
                    <Icon name="trash" size={15} />Remove
                  </button>
                )}
              </div>
            )}
          </div>

          {employee && (
            <div className="edit-employee-summary">
              <span className={`avatar avatar-${employee.id % 5}`} aria-hidden="true">
                {getInitials(employee.name)}
              </span>
              <div>
                <strong>{employee.name}</strong>
                <span>Employee #{employee.id}</span>
              </div>
              <span className="department-badge">{employee.department}</span>
            </div>
          )}

          <div className="form-grid">
            <FormField
              name="name"
              label="Full name"
              labelHint="First & last"
              helper="Enter the employee's full name."
              error={errors.name}
              fullWidth
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-control">
                  <Icon name="users" size={18} />
                  <input
                    {...fieldProps('name')}
                    type="text"
                    maxLength={100}
                    placeholder="e.g. Avery Morgan"
                    autoComplete="name"
                    aria-describedby={describedBy}
                    data-autofocus
                  />
                </div>
              )}
            </FormField>

            <FormField
              name="email"
              label="Email address"
              helper="Enter a valid email address."
              error={errors.email}
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-control">
                  <Icon name="mail" size={18} />
                  <input
                    {...fieldProps('email')}
                    type="email"
                    maxLength={255}
                    placeholder="avery@company.com"
                    autoComplete="email"
                    aria-describedby={describedBy}
                  />
                </div>
              )}
            </FormField>

            <FormField
              name="phone"
              label="Phone number"
              helper="Include area code and number."
              error={errors.phone}
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-control">
                  <Icon name="phone" size={18} />
                  <input
                    {...fieldProps('phone')}
                    type="tel"
                    maxLength={20}
                    placeholder="+1 (415) 555-0132"
                    autoComplete="tel"
                    aria-describedby={describedBy}
                  />
                </div>
              )}
            </FormField>

            <FormField
              name="department"
              label="Department"
              helper="Select or enter a department."
              error={errors.department}
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-control">
                  <Icon name="building" size={18} />
                  <input
                    {...fieldProps('department')}
                    type="text"
                    maxLength={100}
                    list="department-options"
                    placeholder="e.g. Engineering"
                    aria-describedby={describedBy}
                  />
                  <datalist id="department-options">
                    {departments.map((department) => (
                      <option key={department} value={department} />
                    ))}
                  </datalist>
                </div>
              )}
            </FormField>

            <FormField
              name="designation"
              label="Designation"
              helper="Enter the employee's job title."
              error={errors.designation}
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-control">
                  <Icon name="briefcase" size={18} />
                  <input
                    {...fieldProps('designation')}
                    type="text"
                    maxLength={100}
                    placeholder="e.g. Software Engineer"
                    aria-describedby={describedBy}
                  />
                </div>
              )}
            </FormField>

            <FormField
              name="salary"
              label="Annual salary (USD)"
              helper="Enter annual salary in USD."
              error={errors.salary}
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-with-prefix">
                  <span aria-hidden="true">$</span>
                  <input
                    {...fieldProps('salary')}
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="95000.00"
                    aria-describedby={describedBy}
                  />
                </div>
              )}
            </FormField>

            <FormField
              name="joining_date"
              label="Joining date"
              helper="Select the joining date."
              error={errors.joining_date}
            >
              {(errorId, invalid, describedBy) => (
                <div className="input-control">
                  <Icon name="calendar" size={18} />
                  <input
                    {...fieldProps('joining_date')}
                    type="date"
                    aria-describedby={describedBy}
                  />
                </div>
              )}
            </FormField>
          </div>

          <TurnstileField
            ref={turnstileRef}
            error={errors.captcha}
            disabled={isBusy}
            onErrorClear={() => setErrors((current) => ({ ...current, captcha: '' }))}
          />
        </div>

        <footer className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={isBusy}>
            {isSaving ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={18} />}
            {isSaving ? 'Saving…' : employee ? 'Save changes' : 'Save employee'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
