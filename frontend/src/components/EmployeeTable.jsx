import { formatDate, formatSalary, getInitials } from '../utils/format.js';
import Icon from './Icon.jsx';

function EmployeeActions({ employee, onEdit, onDelete }) {
  return (
    <div className="row-actions">
      <button
        type="button"
        className="button button-icon button-ghost"
        onClick={() => onEdit(employee)}
        aria-label={`Edit ${employee.name}`}
        title="Edit employee"
      >
        <Icon name="edit" size={17} />
      </button>
      <button
        type="button"
        className="button button-icon button-ghost button-delete"
        onClick={() => onDelete(employee)}
        aria-label={`Delete ${employee.name}`}
        title="Delete employee"
      >
        <Icon name="trash" size={17} />
      </button>
    </div>
  );
}

export default function EmployeeTable({ employees, onEdit, onDelete, canManage = true }) {
  return (
    <>
      <div className="table-scroll desktop-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Email &amp; phone</th>
              <th scope="col">Department</th>
              <th scope="col">Designation</th>
              <th scope="col">Salary</th>
              <th scope="col">Joining date</th>
              <th scope="col">Created date</th>
              {canManage && <th scope="col" className="actions-column">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <div className="employee-cell">
                    <span className={`avatar avatar-${employee.id % 5}`} aria-hidden="true">
                      {getInitials(employee.name)}
                    </span>
                    <div>
                      <strong>{employee.name}</strong>
                      <span>Employee #{employee.id}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="contact-cell">
                    <span title={employee.email}>{employee.email}</span>
                    <span>{employee.phone}</span>
                  </div>
                </td>
                <td><span className="department-badge">{employee.department}</span></td>
                <td>{employee.designation}</td>
                <td className="salary-cell">{formatSalary(employee.salary)}</td>
                <td className="date-cell">
                  <strong>{formatDate(employee.joining_date)}</strong>
                </td>
                <td className="created-cell">{formatDate(employee.created_at)}</td>
                {canManage && (
                  <td>
                    <EmployeeActions employee={employee} onEdit={onEdit} onDelete={onDelete} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="employee-mobile-list">
        {employees.map((employee) => (
          <article className="employee-card" key={employee.id}>
            <header className="employee-card-header">
              <div className="employee-cell">
                <span className={`avatar avatar-${employee.id % 5}`} aria-hidden="true">
                  {getInitials(employee.name)}
                </span>
                <div>
                  <strong>{employee.name}</strong>
                  <span>Employee #{employee.id}</span>
                </div>
              </div>
              {canManage && <EmployeeActions employee={employee} onEdit={onEdit} onDelete={onDelete} />}
            </header>
            <dl className="employee-card-details">
              <div>
                <dt>Email</dt>
                <dd>{employee.email}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{employee.phone}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd><span className="department-badge">{employee.department}</span></dd>
              </div>
              <div>
                <dt>Designation</dt>
                <dd>{employee.designation}</dd>
              </div>
              <div>
                <dt>Salary</dt>
                <dd className="salary-cell">{formatSalary(employee.salary)}</dd>
              </div>
              <div>
                <dt>Joining date</dt>
                <dd>{formatDate(employee.joining_date)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(employee.created_at)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

export function EmployeeTableSkeleton({ canManage = true }) {
  return (
    <>
      <div className="table-scroll desktop-table" aria-label="Loading employees" aria-busy="true">
        <table>
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Email &amp; phone</th>
              <th scope="col">Department</th>
              <th scope="col">Designation</th>
              <th scope="col">Salary</th>
              <th scope="col">Joining date</th>
              <th scope="col">Created date</th>
              {canManage && <th scope="col" className="actions-column">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, index) => (
              <tr key={index}>
                <td><div className="skeleton skeleton-employee" /></td>
                <td><div className="skeleton skeleton-text" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-text" /></td>
                <td><div className="skeleton skeleton-short" /></td>
                <td><div className="skeleton skeleton-text" /></td>
                <td><div className="skeleton skeleton-text" /></td>
                {canManage && <td><div className="skeleton skeleton-short" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="employee-mobile-list" aria-label="Loading employees" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="employee-card employee-card-skeleton" key={index}>
            <div className="skeleton skeleton-employee" />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-badge" />
          </div>
        ))}
      </div>
    </>
  );
}
