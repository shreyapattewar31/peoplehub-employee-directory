import { useState } from 'react';
import { deleteEmployee } from '../api.js';
import { getInitials } from '../utils/format.js';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

export default function DeleteEmployeeModal({ employee, onClose, onDeleted }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      await deleteEmployee(employee.id);
      onDeleted(employee);
    } catch (deleteError) {
      setError(deleteError.message || 'The employee could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      title="Delete employee"
      description="Are you sure you want to delete this employee? This action is permanent and cannot be undone."
      onClose={onClose}
      size="small"
      icon="alert"
      iconTone="danger"
      className="modal-delete"
    >
      <div className="modal-body delete-body">
        <div className="delete-employee">
          <span className={`avatar avatar-${employee.id % 5}`} aria-hidden="true">
            {getInitials(employee.name)}
          </span>
          <div className="delete-employee-main">
            <div className="delete-employee-title">
              <strong>{employee.name}</strong>
              <span className="employee-id-badge">Employee #{employee.id}</span>
            </div>
            <span>{employee.designation}</span>
          </div>
        </div>
        <dl className="delete-details">
          <div>
            <dt>Department</dt>
            <dd>{employee.department}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{employee.email}</dd>
          </div>
        </dl>
        <div className="delete-notice">
          <Icon name="alert" size={18} />
          <p>This employee record will be permanently removed from the directory.</p>
        </div>
        {error && (
          <div className="alert alert-error delete-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={isDeleting} data-autofocus>
          Cancel
        </button>
        <button type="button" className="button button-danger" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? <span className="spinner" aria-hidden="true" /> : <Icon name="trash" size={18} />}
          {isDeleting ? 'Deleting…' : 'Delete employee'}
        </button>
      </footer>
    </Modal>
  );
}
