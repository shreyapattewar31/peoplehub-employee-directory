import { useEffect, useState } from 'react';
import { listAuditLogs } from '../api.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatDateTime, getInitials } from '../utils/format.js';
import Icon from './Icon.jsx';
import Pagination from './Pagination.jsx';

const PAGE_SIZE = 10;

const ACTION_OPTIONS = [
  { value: '', label: 'All activity' },
  { value: 'employee.created', label: 'Employees added' },
  { value: 'employee.updated', label: 'Employee updates' },
  { value: 'employee.deleted', label: 'Employees deleted' },
  { value: 'account.registered', label: 'Accounts created' },
  { value: 'auth.login', label: 'Sign-ins' },
  { value: 'auth.logout', label: 'Sign-outs' },
];

const ACTION_META = {
  'employee.created': { label: 'Employee added', tone: 'success' },
  'employee.updated': { label: 'Employee updated', tone: 'info' },
  'employee.deleted': { label: 'Employee deleted', tone: 'danger' },
  'account.registered': { label: 'Account created', tone: 'info' },
  'auth.login': { label: 'Signed in', tone: 'neutral' },
  'auth.logout': { label: 'Signed out', tone: 'neutral' },
};

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedSearch = useDebouncedValue(searchInput);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLogs() {
      setIsLoading(true);
      setError('');

      try {
        const response = await listAuditLogs({
          page,
          limit,
          action,
          entityType,
          search: debouncedSearch,
        }, { signal: controller.signal });

        setLogs(response.data);
        setPagination(response.pagination);

        if (response.pagination.totalPages > 0 && page > response.pagination.totalPages) {
          setPage(response.pagination.totalPages);
        }
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Activity could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadLogs();
    return () => controller.abort();
  }, [page, limit, action, entityType, debouncedSearch, reloadKey]);

  const startResult = pagination.total === 0 ? 0 : (pagination.page - 1) * limit + 1;
  const endResult = Math.min((pagination.page - 1) * limit + logs.length, pagination.total);
  const hasFilters = Boolean(searchInput || action || entityType);

  const clearFilters = () => {
    setSearchInput('');
    setAction('');
    setEntityType('');
    setPage(1);
  };

  return (
    <section className="directory-card activity-card" id="activity" aria-labelledby="activity-title">
      <div className="directory-header">
        <div className="directory-heading">
          <div>
            <h2 id="activity-title">Workspace activity</h2>
            <p>
              {isLoading && logs.length === 0
                ? 'Loading activity records…'
                : `Showing ${startResult}–${endResult} of ${pagination.total} events`}
            </p>
          </div>
          <span className="record-count">{pagination.total} events</span>
        </div>

        <div className="toolbar activity-toolbar">
          <div className="search-field">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Search activity or person…"
              aria-label="Search activity log"
            />
            {searchInput && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setSearchInput('');
                  setPage(1);
                }}
                aria-label="Clear activity search"
              >
                <Icon name="x" size={15} />
              </button>
            )}
          </div>
          <div className="select-field">
            <Icon name="activity" size={17} />
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
              aria-label="Filter activity by type"
            >
              {ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Icon name="arrowDown" size={14} className="select-chevron" />
          </div>
          <div className="select-field">
            <select
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
              aria-label="Filter activity by record"
            >
              <option value="">All records</option>
              <option value="employee">Employees</option>
              <option value="account">Accounts</option>
            </select>
            <Icon name="arrowDown" size={14} className="select-chevron" />
          </div>
          {hasFilters && (
            <button type="button" className="button button-secondary button-small reset-button" onClick={clearFilters}>
              <Icon name="x" size={15} />
              Reset
            </button>
          )}
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={isLoading}
          >
            <Icon name="refresh" size={15} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error list-alert" role="alert">
          <Icon name="alert" size={19} />
          <div>
            <strong>Unable to load activity</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="button button-secondary button-small" onClick={() => setReloadKey((value) => value + 1)}>
            <Icon name="refresh" size={16} />
            Retry
          </button>
        </div>
      )}

      {isLoading && <div className="loading-progress" aria-label="Refreshing activity records" />}

      {isLoading && logs.length === 0 ? (
        <div className="activity-skeleton" aria-label="Loading activity" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="activity-skeleton-row" key={index}>
              <div className="skeleton skeleton-short" />
              <div className="skeleton skeleton-text" />
              <div className="skeleton skeleton-employee" />
            </div>
          ))}
        </div>
      ) : error && logs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="alert" size={28} /></span>
          <h3>Activity is unavailable</h3>
          <p>Check your connection and try loading the audit log again.</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="activity" size={30} /></span>
          <h3>No activity found</h3>
          <p>{hasFilters ? 'Try a different search or clear the activity filters.' : 'Account and employee changes will appear here as they happen.'}</p>
          {hasFilters && (
            <button type="button" className="button button-secondary" onClick={clearFilters}>
              <Icon name="x" size={17} />
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={isLoading ? 'table-is-loading' : ''}>
          <div className="table-scroll activity-table-scroll activity-desktop">
            <table className="activity-table">
              <thead>
                <tr>
                  <th scope="col">Date &amp; time</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Performed by</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = ACTION_META[log.action] || { label: log.action, tone: 'neutral' };
                  return (
                    <tr key={log.id}>
                      <td className="activity-time">
                        <time dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
                        {log.ip_address && <span>{log.ip_address}</span>}
                      </td>
                      <td>
                        <span className={`activity-badge activity-badge-${meta.tone}`}>
                          <Icon name={log.action === 'auth.logout' ? 'logout' : log.action.startsWith('employee.') ? 'users' : 'shield'} size={14} />
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <div className="activity-actor">
                          <span className="avatar avatar-0" aria-hidden="true">{getInitials(log.user_name)}</span>
                          <div>
                            <strong>{log.user_name}</strong>
                            <span>{log.user_email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="activity-description">
                          <strong>{log.summary}</strong>
                          <span>{log.entity_type === 'employee' ? `Employee #${log.entity_id}` : `Account #${log.entity_id}`}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="activity-mobile-list">
            {logs.map((log) => {
              const meta = ACTION_META[log.action] || { label: log.action, tone: 'neutral' };
              return (
                <article className="activity-mobile-card" key={log.id}>
                  <div className="activity-mobile-top">
                    <span className={`activity-badge activity-badge-${meta.tone}`}>
                      <Icon name="activity" size={14} />{meta.label}
                    </span>
                    <time dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
                  </div>
                  <strong>{log.summary}</strong>
                  <div className="activity-mobile-actor">
                    <span className="avatar avatar-0" aria-hidden="true">{getInitials(log.user_name)}</span>
                    <div><span>{log.user_name}</span><small>{log.user_email}</small></div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <footer className="directory-footer">
        <p>Audit records are stored permanently and sorted newest first.</p>
        <Pagination
          pagination={pagination}
          page={page}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(size) => { setLimit(size); setPage(1); }}
          disabled={isLoading}
          label="Activity pages"
        />
      </footer>
    </section>
  );
}
