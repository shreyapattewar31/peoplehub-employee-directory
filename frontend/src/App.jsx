import { useCallback, useEffect, useState } from 'react';
import { getAdminSettings, getDepartments, listEmployees } from './api.js';
import { useAuth } from './AuthContext.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import AuthPage from './components/AuthPage.jsx';
import DeleteEmployeeModal from './components/DeleteEmployeeModal.jsx';
import EmployeeForm from './components/EmployeeForm.jsx';
import EmployeePortal from './components/EmployeePortal.jsx';
import EmployeeTable, { EmployeeTableSkeleton } from './components/EmployeeTable.jsx';
import Icon from './components/Icon.jsx';
import OnboardingModal from './components/OnboardingModal.jsx';
import OnboardingPage from './components/OnboardingPage.jsx';
import OnboardingReview from './components/OnboardingReview.jsx';
import AdminWorkforce from './components/AdminWorkforce.jsx';
import Pagination from './components/Pagination.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import ToastStack from './components/ToastStack.jsx';
import { useDebouncedValue } from './hooks/useDebouncedValue.js';
import { getInitials } from './utils/format.js';
import { saveDisplayPreferences } from './utils/preferences.js';

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

  const pathname = window.location.pathname.replace(/\/+$/, '');
  const isOnboarding = pathname === '' || pathname === '/onboarding' || pathname === '/onboarding/complete';

  if (isOnboarding) {
    return <OnboardingPage completed={pathname === '/onboarding/complete'} />;
  }

  if (!user) {
    return <AuthPage initialMode="login" />;
  }

  if (user.role !== 'admin') {
    return <EmployeePortal user={user} onLogout={signOut} />;
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
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [formState, setFormState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const debouncedSearch = useDebouncedValue(searchInput);

  const addToast = useCallback((type, message) => {
    setToasts((current) => [...current.slice(-2), { id: `${Date.now()}-${Math.random()}`, type, message }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    getAdminSettings().then((response) => {
      saveDisplayPreferences(response.data);
    }).catch(() => {});
  }, []);

  const refreshDepartments = useCallback(async () => {
    try {
      const response = await getDepartments();
      setDepartments(response.data);
    } catch {
      addToast('error', 'The department filter could not be refreshed.');
    }
  }, [addToast]);

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
          limit: pageSize,
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
  }, [page, pageSize, debouncedSearch, department, sortBy, sortOrder, reloadKey]);

  useEffect(() => {
    if (activeView !== 'employees') {
      return undefined;
    }

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        setReloadKey((value) => value + 1);
      }
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [activeView]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileNavOpen]);

  const closeForm = useCallback(() => setFormState(null), []);
  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);
  const closeOnboardingModal = useCallback(() => setIsOnboardingOpen(false), []);

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
    addToast('success', mode === 'create'
      ? `${employee.name} was added to the directory.`
      : `${employee.name}'s details were updated.`);
  };

  const handleDeleted = (employee) => {
    setDeleteTarget(null);

    if (employees.length === 1 && page > 1) {
      setPage((value) => value - 1);
    } else {
      setReloadKey((value) => value + 1);
    }

    addToast('success', `${employee.name} was removed from the directory.`);
    refreshDepartments();
  };

  const clearFilters = () => {
    setSearchInput('');
    setDepartment('');
    setSortBy('name');
    setSortOrder('asc');
    setPage(1);
  };

  const changeView = (view) => {
    setActiveView(view);
    setIsMobileNavOpen(false);
  };

  const startResult = pagination.total === 0 ? 0 : (pagination.page - 1) * pageSize + 1;
  const endResult = Math.min((pagination.page - 1) * pageSize + employees.length, pagination.total);
  const hasFilters = Boolean(searchInput || department);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <button type="button" className="mobile-nav-close" onClick={() => setIsMobileNavOpen(false)} aria-label="Close navigation">
            <Icon name="x" size={20} />
          </button>
          <a className="brand" href="/login" aria-label="PeopleHub employee directory home">
            <span className="brand-mark"><Icon name="users" size={21} /></span>
            <span>PeopleHub</span>
            <span className="portal-badge">Portal</span>
          </a>
          <p className="nav-label">Directory</p>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={`nav-item ${activeView === 'employees' ? 'nav-item-active' : ''}`}
              onClick={() => changeView('employees')}
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
                onClick={() => changeView('activity')}
                aria-current={activeView === 'activity' ? 'page' : undefined}
              >
                <span className="nav-item-label">
                  <Icon name="activity" size={19} />
                  Activity log
                </span>
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className={`nav-item ${activeView === 'onboarding' ? 'nav-item-active' : ''}`}
                onClick={() => changeView('onboarding')}
                aria-current={activeView === 'onboarding' ? 'page' : undefined}
              >
                <span className="nav-item-label">
                  <Icon name="shield" size={19} />
                  Onboarding review
                </span>
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className={`nav-item ${activeView === 'attendance' ? 'nav-item-active' : ''}`}
                onClick={() => changeView('attendance')}
                aria-current={activeView === 'attendance' ? 'page' : undefined}
              >
                <span className="nav-item-label">
                  <Icon name="clock" size={19} />
                  Attendance
                </span>
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className={`nav-item ${activeView === 'leave' ? 'nav-item-active' : ''}`}
                onClick={() => changeView('leave')}
                aria-current={activeView === 'leave' ? 'page' : undefined}
              >
                <span className="nav-item-label">
                  <Icon name="calendar" size={19} />
                  Leave requests
                </span>
              </button>
            )}
            <button
              type="button"
              className={`nav-item ${activeView === 'settings' ? 'nav-item-active' : ''}`}
              onClick={() => changeView('settings')}
              aria-current={activeView === 'settings' ? 'page' : undefined}
            >
              <span className="nav-item-label">
                <Icon name="settings" size={19} />
                Settings
              </span>
            </button>
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
            <button type="button" className="mobile-menu-button" onClick={() => setIsMobileNavOpen(true)} aria-label="Open navigation" aria-expanded={isMobileNavOpen}>
              <Icon name="menu" size={21} />
            </button>
            <a className="mobile-brand" href="/login" aria-label="PeopleHub home">
              <span className="brand-mark"><Icon name="users" size={19} /></span>
              <span>PeopleHub</span>
            </a>
            <div className="breadcrumb" aria-label="Breadcrumb">
              <Icon name="building" size={17} />
              <span>PeopleHub</span>
              <Icon name="chevronRight" size={14} />
              <strong>{{
                settings: 'Admin Settings',
                activity: 'Activity Log',
                onboarding: 'Onboarding Review',
                attendance: 'Attendance',
                leave: 'Leave Requests',
                employees: 'Employee Directory',
              }[activeView]}</strong>
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
          {activeView === 'settings' ? null : activeView === 'activity' ? (
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
          ) : activeView === 'onboarding' ? (
            <section className="page-header">
              <div className="page-heading">
                <p className="eyebrow">People operations</p>
                <h1>Onboarding Review</h1>
                <p className="page-description">Verify employee documents and approve account access.</p>
              </div>
              <span className="role-badge"><Icon name="shield" size={15} />Admin only</span>
            </section>
          ) : activeView === 'attendance' || activeView === 'leave' ? (
            <section className="page-header">
              <div className="page-heading">
                <p className="eyebrow">People operations</p>
                <h1>{activeView === 'attendance' ? 'Attendance' : 'Leave Requests'}</h1>
                <p className="page-description">{activeView === 'attendance' ? 'Review employee punch-in and punch-out records.' : 'Approve or reject employee leave applications.'}</p>
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
                <div className="page-header-actions">
                  <button
                    type="button"
                    className="button button-secondary button-add"
                    onClick={() => setIsOnboardingOpen(true)}
                  >
                    <Icon name="form" size={18} />
                    Import Google Form
                  </button>
                  <button type="button" className="button button-primary button-add" onClick={openCreateForm}>
                    <Icon name="plus" size={19} />
                    Add employee
                  </button>
                </div>
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
              <Pagination
                pagination={pagination}
                page={page}
                limit={pageSize}
                onPageChange={setPage}
                onLimitChange={(size) => { setPageSize(size); setPage(1); }}
                disabled={isLoading}
                label="Employee pages"
              />
            </footer>
          </section>
            </>
          )}

          {activeView === 'activity' && <ActivityLog />}
          {activeView === 'onboarding' && <OnboardingReview />}
          {(activeView === 'attendance' || activeView === 'leave') && <AdminWorkforce initialTab={activeView} />}
          {activeView === 'settings' && <SettingsPanel onNotify={addToast} />}

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
          onNotify={addToast}
        />
      )}

      {isAdmin && deleteTarget && (
        <DeleteEmployeeModal
          employee={deleteTarget}
          onClose={closeDeleteModal}
          onDeleted={handleDeleted}
        />
      )}

      {isAdmin && isOnboardingOpen && (
        <OnboardingModal onClose={closeOnboardingModal} />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {isMobileNavOpen && <button type="button" className="mobile-nav-backdrop" onClick={() => setIsMobileNavOpen(false)} aria-label="Close navigation" />}
    </div>
  );
}
