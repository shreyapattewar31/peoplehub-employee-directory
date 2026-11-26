import { useCallback, useEffect, useState } from 'react';
import { getDepartments, listEmployees } from './api.js';
import { useAuth } from './AuthContext.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import AuthPage from './components/AuthPage.jsx';
import DeleteEmployeeModal from './components/DeleteEmployeeModal.jsx';
import EmployeeForm from './components/EmployeeForm.jsx';
import EmployeeTable, { EmployeeTableSkeleton } from './components/EmployeeTable.jsx';
import Icon from './components/Icon.jsx';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import { getInitials } from './utils/format.js';

const PAGE_SIZE = 10;

export default function App() {
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading" role="status">
        <span className="brand-mark"><Icon name="users" size={21} /></span>
        <strong>PeopleHub</strong>
        <span className="spinner" aria-hidden="true" />
        <span>Checking your session…</span>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <EmployeeDirectory user={user} onLogout={signOut} />;
}

function EmployeeDirectory({ user, onLogout }) {
  const isAdmin = user.role === 'admin';
  const [activeView, setActiveView] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState('');
  const [department, setDepartment] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [formState, setFormState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const debouncedSearch = useDebouncedValue(searchInput);

  const refreshDepartments = useCallback(async () => {
    try {
      const response = await getDepartments();
      setDepartments(response.data);
    } catch {
      setToast({ type: 'error', message: 'The department filter could not be refreshed.' });
    }
  }, []);

  useEffect(() => {
    refreshDepartments();
  }, [refreshDepartments, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEmployees() {
      setIsLoading(true);
      setListError('');

      try {
        const response = await listEmployees({
          page,
          limit: PAGE_SIZE,
          search: debouncedSearch,
          department,
          sortBy,
          sortOrder,
        }, { signal: controller.signal });

        setEmployees(response.data);
        setPagination(response.pagination);

        if (response.pagination.totalPages > 0 && page > response.pagination.totalPages) {
          setPage(response.pagination.totalPages);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          setListError(error.message || 'Employees could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadEmployees();
    return () => controller.abort();
  }, [page, debouncedSearch, department, sortBy, sortOrder, reloadKey]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const closeForm = useCallback(() => setFormState(null), []);
  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  const openCreateForm = () => setFormState({ mode: 'create', employee: null });
  const openEditForm = (employee) => setFormState({ mode: 'edit', employee });

  const handleSaved = (employee, mode) => {
    setFormState(null);

    if (mode === 'create') {
      setSearchInput('');
      setDepartment('');
      setSortBy('name');
      setSortOrder('asc');
      setPage(1);
    }

    setReloadKey((value) => value + 1);
    setToast({
      type: 'success',
      message: mode === 'create'
        ? `${employee.name} was added to the directory.`
        : `${employee.name}'s details were updated.`,
    });
  };

  const handleDeleted = (employee) => {
    setDeleteTarget(null);

    if (employees.length === 1 && page > 1) {
      setPage((value) => value - 1);
    } else {
      setReloadKey((value) => value + 1);
    }

    setToast({ type: 'success', message: `${employee.name} was removed from the directory.` });
  };

  const clearFilters = () => {
    setSearchInput('');
    setDepartment('');
    setSortBy('name');
    setSortOrder('asc');
    setPage(1);
  };

  const startResult = pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1;
  const endResult = Math.min((pagination.page - 1) * PAGE_SIZE + employees.length, pagination.total);
  const hasFilters = Boolean(searchInput || department);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <a className="brand" href="/" aria-label="PeopleHub employee directory home">
            <span className="brand-mark"><Icon name="users" size={21} /></span>
            <span>PeopleHub</span>
            <span className="portal-badge">Portal</span>
          </a>
          <p className="nav-label">Directory</p>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={`nav-item ${activeView === 'employees' ? 'nav-item-active' : ''}`}
              onClick={() => setActiveView('employees')}
              aria-current={activeView === 'employees' ? 'page' : undefined}
            >
              <span className="nav-item-label">
                <Icon name="users" size={19} />
                Employees
              </span>
              <span className="nav-count">{pagination.total}</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                className={`nav-item ${activeView === 'activity' ? 'nav-item-active' : ''}`}
                onClick={() => setActiveView('activity')}
                aria-current={activeView === 'activity' ? 'page' : undefined}
              >
                <span className="nav-item-label">
                  <Icon name="activity" size={19} />
                  Activity log
                </span>
              </button>
            )}
          </nav>
        </div>
        <div className="sidebar-footer">
          <span className="workspace-avatar">{getInitials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-inner">
            <a className="mobile-brand" href="/" aria-label="PeopleHub home">
              <span className="brand-mark"><Icon name="users" size={19} /></span>
              <span>PeopleHub</span>
            </a>
            <div className="breadcrumb" aria-label="Breadcrumb">
              <Icon name="building" size={17} />
              <span>PeopleHub</span>
              <Icon name="chevronRight" size={14} />
              <strong>{activeView === 'activity' ? 'Activity Log' : 'Employee Directory'}</strong>
            </div>
            <div className="topbar-actions">
              {isAdmin && (
                <button
                  type="button"
                  className={`activity-shortcut ${activeView === 'activity' ? 'activity-shortcut-active' : ''}`}
                  onClick={() => setActiveView(activeView === 'activity' ? 'employees' : 'activity')}
                  aria-label={activeView === 'activity' ? 'Show employee directory' : 'Show activity log'}
                  title={activeView === 'activity' ? 'Employee directory' : 'Activity log'}
                >
                  <Icon name="activity" size={18} />
                </button>
              )}
              <div className="admin-profile">
                <span className="admin-avatar">{getInitials(user.name)}</span>
                <div>
                  <strong>{user.name}</strong>
                  <span>{isAdmin ? 'Administrator' : 'Read-only member'}</span>
                </div>
                <button
                  type="button"
                  className="profile-logout"
                  onClick={onLogout}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <Icon name="logout" size={17} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="main-content">
          {activeView === 'activity' ? (
            <section className="page-header">
              <div className="page-heading">
                <p className="eyebrow">Administration</p>
                <h1>Activity Log</h1>
                <p className="page-description">
                  Review account access and employee changes across your workspace.
                </p>
              </div>
              <span className="role-badge"><Icon name="shield" size={15} />Admin only</span>
            </section>
          ) : (
            <section className="page-header">
              <div className="page-heading">
                <p className="eyebrow">People operations</p>
                <h1>Employee Directory</h1>
                <p className="page-description">
                  {isAdmin
                    ? 'Manage, search, and update employee records in one place.'
                    : 'Search and browse employee records. Administrator access is required to make changes.'}
                </p>
              </div>
              {isAdmin && (
                <button type="button" className="button button-primary button-add" onClick={openCreateForm}>
                  <Icon name="plus" size={19} />
                  Add employee
                </button>
              )}
            </section>
          )}

          {activeView === 'employees' && (
            <>
          <section className="summary-grid" aria-label="Directory summary">
            <article className="summary-card">
              <div className="summary-card-top">
                <span>{hasFilters ? 'Matching employees' : 'Total employees'}</span>
                <span className="summary-icon summary-icon-indigo"><Icon name="users" size={20} /></span>
              </div>
              <strong>{isLoading && pagination.total === 0 ? '—' : pagination.total}</strong>
              <small>{hasFilters ? 'For the current filters' : 'Across the organization'}</small>
            </article>
            <article className="summary-card">
              <div className="summary-card-top">
                <span>Departments</span>
                <span className="summary-icon summary-icon-cyan"><Icon name="building" size={20} /></span>
              </div>
              <strong>{departments.length || '—'}</strong>
              <small>Teams in your directory</small>
            </article>
            <article className="summary-card">
              <div className="summary-card-top">
                <span>Records shown</span>
                <span className="summary-icon summary-icon-violet"><Icon name="layers" size={20} /></span>
              </div>
              <strong>{employees.length}</strong>
              <small>Of {pagination.total} matching records</small>
            </article>
          </section>

          <section className="directory-card" id="directory" aria-labelledby="directory-title">
            <div className="directory-header">
              <div className="directory-heading">
                <div>
                  <h2 id="directory-title">All employees</h2>
                  <p>
                    {isLoading && employees.length === 0
                      ? 'Loading employee records…'
                      : `Showing ${startResult}–${endResult} of ${pagination.total} employees`}
                  </p>
                </div>
                <span className="record-count">{pagination.total} records</span>
              </div>

              <div className="toolbar">
                <div className="search-field">
                  <Icon name="search" size={18} />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by name, email, or phone…"
                    aria-label="Search employees"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      className="search-clear"
                      onClick={() => {
                        setSearchInput('');
                        setPage(1);
                      }}
                      aria-label="Clear search"
                    >
                      <Icon name="x" size={15} />
                    </button>
                  )}
                </div>
                <div className="select-field">
                  <Icon name="building" size={17} />
                  <select
                    value={department}
                    onChange={(event) => {
                      setDepartment(event.target.value);
                      setPage(1);
                    }}
                    aria-label="Filter by department"
                  >
                    <option value="">All departments</option>
                    {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <Icon name="arrowDown" size={14} className="select-chevron" />
                </div>
                <div className="select-field sort-field">
                  <select
                    value={`${sortBy}:${sortOrder}`}
                    onChange={(event) => {
                      const [nextSortBy, nextSortOrder] = event.target.value.split(':');
                      setSortBy(nextSortBy);
                      setSortOrder(nextSortOrder);
                      setPage(1);
                    }}
                    aria-label="Sort employees"
                  >
                    <option value="name:asc">Name A–Z</option>
                    <option value="name:desc">Name Z–A</option>
                    <option value="salary:desc">Highest salary</option>
                    <option value="salary:asc">Lowest salary</option>
                    <option value="joining_date:desc">Newest joiners</option>
                    <option value="joining_date:asc">Oldest joiners</option>
                    <option value="department:asc">Department A–Z</option>
                  </select>
                  <Icon name="arrowDown" size={14} className="select-chevron" />
                </div>
                <button type="button" className="button button-secondary button-small reset-button" onClick={clearFilters}>
                  <Icon name="refresh" size={15} />
                  Reset
                </button>
              </div>
            </div>

            {listError && (
              <div className="alert alert-error list-alert" role="alert">
                <Icon name="alert" size={19} />
                <div>
                  <strong>Unable to load employees</strong>
                  <span>{listError}</span>
                </div>
                <button type="button" className="button button-secondary button-small" onClick={() => setReloadKey((value) => value + 1)}>
                  <Icon name="refresh" size={16} />
                  Retry
                </button>
              </div>
            )}

            {isLoading && <div className="loading-progress" aria-label="Refreshing employee records" />}

            {isLoading && employees.length === 0 ? (
              <EmployeeTableSkeleton canManage={isAdmin} />
            ) : listError && employees.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon"><Icon name="alert" size={28} /></span>
                <h3>No records to display</h3>
                <p>Check your connection and try loading the directory again.</p>
                <button type="button" className="button button-secondary" onClick={() => setReloadKey((value) => value + 1)}>
                  <Icon name="refresh" size={17} />
                  Try again
                </button>
              </div>
            ) : employees.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon"><Icon name="empty" size={30} /></span>
                <h3>{hasFilters ? 'No matching employees' : 'Your directory is ready'}</h3>
                <p>{hasFilters
                  ? 'Try a different search term or clear the department filter.'
                  : 'Add your first employee to start building the directory.'}</p>
                {hasFilters ? (
                  <button type="button" className="button button-secondary" onClick={clearFilters}>
                    <Icon name="x" size={17} />
                    Clear filters
                  </button>
                ) : isAdmin ? (
                  <button type="button" className="button button-primary" onClick={openCreateForm}>
                    <Icon name="plus" size={17} />
                    Add first employee
                  </button>
                ) : (
                  <span className="read-only-note"><Icon name="lock" size={15} />Read-only access</span>
                )}
              </div>
            ) : (
              <div className={isLoading ? 'table-is-loading' : ''}>
                <EmployeeTable
                  employees={employees}
                  onEdit={openEditForm}
                  onDelete={setDeleteTarget}
                  canManage={isAdmin}
                />
              </div>
            )}

            <footer className="directory-footer">
              <p>{hasFilters ? 'Filters are applied to these results.' : isAdmin ? 'All employee records' : 'Read-only employee directory'}</p>
              {pagination.totalPages > 1 && (
                <nav className="pagination" aria-label="Employee pages">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => setPage((value) => value - 1)}
                    disabled={page === 1 || isLoading}
                  >
                    <Icon name="chevronLeft" size={16} />
                    Previous
                  </button>
                  <span className="page-number">{pagination.page}</span>
                  <span className="page-total">of {pagination.totalPages}</span>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => setPage((value) => value + 1)}
                    disabled={page >= pagination.totalPages || isLoading}
                  >
                    Next
                    <Icon name="chevronRight" size={16} />
                  </button>
                </nav>
              )}
            </footer>
          </section>
            </>
          )}

          {activeView === 'activity' && <ActivityLog />}

          <p className="app-footnote">PeopleHub <span>·</span> Employee Directory</p>
        </main>
      </div>

      {isAdmin && formState && (
        <EmployeeForm
          key={formState.employee?.id || 'new'}
          employee={formState.employee}
          departments={departments}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {isAdmin && deleteTarget && (
        <DeleteEmployeeModal
          employee={deleteTarget}
          onClose={closeDeleteModal}
          onDeleted={handleDeleted}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon">
            <Icon name={toast.type === 'error' ? 'alert' : 'check'} size={18} />
          </span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
