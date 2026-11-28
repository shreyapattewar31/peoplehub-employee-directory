import { useCallback, useEffect, useState } from 'react';
import { decideLeaveRequest, listAdminAttendance, listAdminLeave } from '../api.js';
import { formatDate, formatDateTime } from '../utils/format.js';
import Icon from './Icon.jsx';
import Pagination from './Pagination.jsx';

const LEAVE_LABELS = {
  casual: 'Casual',
  sick: 'Sick',
  earned: 'Earned',
  unpaid: 'Unpaid',
  other: 'Other',
};

export default function AdminWorkforce({ initialTab = 'attendance' }) {
  const [tab, setTab] = useState(initialTab);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      if (tab === 'attendance') {
        const response = await listAdminAttendance({ date });
        setAttendance(response.data);
      } else {
        const response = await listAdminLeave({ status, page, pageSize: 25 });
        setLeaves(response.data);
        setPagination(response.pagination);
      }
    } catch (requestError) {
      setError(requestError.message || 'Workforce records could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [date, page, status, tab]);

  useEffect(() => {
    loadData();
  }, [loadData, reloadKey]);

  const decideLeave = async (leave, decision) => {
    const comment = decision === 'rejected' ? window.prompt('Reason for rejecting this leave request:') : '';
    if (decision === 'rejected' && !comment?.trim()) return;
    setAction(`${leave.id}:${decision}`);
    setError('');
    try {
      await decideLeaveRequest(leave.id, { decision, comment: comment?.trim() || '' });
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message || 'The leave decision could not be saved.');
    } finally {
      setAction('');
    }
  };

  return (
    <section className="workforce-workspace" aria-labelledby="workforce-title">
      <div className="workforce-tabs" role="tablist" aria-label="Workforce views">
        <button type="button" role="tab" aria-selected={tab === 'attendance'} className={tab === 'attendance' ? 'is-active' : ''} onClick={() => setTab('attendance')}><Icon name="clock" size={18} />Attendance</button>
        <button type="button" role="tab" aria-selected={tab === 'leave'} className={tab === 'leave' ? 'is-active' : ''} onClick={() => setTab('leave')}><Icon name="calendar" size={18} />Leave requests</button>
      </div>

      <div className="review-toolbar">
        {tab === 'attendance' ? (
          <div className="auth-field toolbar-date"><label htmlFor="attendance-date">Business date</label><input id="attendance-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        ) : (
          <div className="auth-field"><label htmlFor="leave-status-filter">Status</label><select id="leave-status-filter" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="">All requests</option></select></div>
        )}
        <button type="button" className="button button-secondary button-small" onClick={() => setReloadKey((value) => value + 1)} disabled={isLoading}><Icon name="refresh" size={15} />Refresh</button>
      </div>

      {error && <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}

      <div className="directory-card workforce-card">
        <div className="directory-header"><div className="directory-heading"><div><h2 id="workforce-title">{tab === 'attendance' ? 'Employee attendance' : 'Employee leave requests'}</h2><p>{tab === 'attendance' ? 'Punch times and captured location accuracy.' : 'Review and decide employee time-off requests.'}</p></div></div></div>
        {isLoading ? <div className="loading-progress" aria-label="Loading workforce records" /> : null}

        {tab === 'attendance' ? (
          attendance.length === 0 ? (
            <div className="empty-state"><Icon name="clock" size={30} /><h3>No attendance recorded</h3><p>Employee punches for this business date will appear here.</p></div>
          ) : (
            <div className="table-scroll"><table className="portal-table"><thead><tr><th>Employee</th><th>Punch</th><th>Time</th><th>Location</th><th>Accuracy</th></tr></thead><tbody>{attendance.map((punch) => <tr key={punch.id}><td><strong>{punch.employeeName}</strong><small>{punch.employeeEmail}</small></td><td><span className={`status-badge status-${punch.punchType === 'in' ? 'approved' : 'pending'}`}>{punch.punchType === 'in' ? 'In' : 'Out'}</span></td><td>{formatDateTime(punch.occurredAt)}</td><td>{punch.latitude?.toFixed(5)}, {punch.longitude?.toFixed(5)}</td><td>{punch.accuracyM?.toFixed(1)} m</td></tr>)}</tbody></table></div>
          )
        ) : leaves.length === 0 ? (
          <div className="empty-state"><Icon name="calendar" size={30} /><h3>No leave requests found</h3><p>Try another status filter.</p></div>
        ) : (
          <div className="table-scroll"><table className="portal-table"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead><tbody>{leaves.map((leave) => <tr key={leave.id}><td><strong>{leave.employeeName}</strong><small>{leave.employeeEmail}</small></td><td>{LEAVE_LABELS[leave.leaveType] || leave.leaveType}</td><td>{formatDate(leave.startDate)} – {formatDate(leave.endDate)}</td><td>{leave.dayCount}</td><td className="reason-cell">{leave.reason}{leave.decisionComment && <small>{leave.decisionComment}</small>}</td><td><span className={`status-badge status-${leave.status}`}>{leave.status}</span></td><td>{leave.status === 'pending' && <div className="table-actions"><button type="button" className="button button-primary button-small" disabled={Boolean(action)} onClick={() => decideLeave(leave, 'approved')}>Approve</button><button type="button" className="button button-secondary button-small" disabled={Boolean(action)} onClick={() => decideLeave(leave, 'rejected')}>Reject</button></div>}</td></tr>)}</tbody></table></div>
        )}

        {tab === 'leave' && <footer className="directory-footer"><p>{pagination.total} leave requests</p><Pagination pagination={pagination} page={page} limit={25} onPageChange={setPage} disabled={isLoading} label="Leave request pages" /></footer>}
      </div>
    </section>
  );
}
