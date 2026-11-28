import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api.js';
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getMyEmployeePortal,
  listMyLeave,
  punchAttendance,
} from '../api.js';
import { formatDate, formatDateTime, getInitials } from '../utils/format.js';
import Icon from './Icon.jsx';

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date(position.timestamp).toISOString(),
      }),
      () => reject(new Error('Location access was denied or unavailable. Enable location and try again.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

const LEAVE_LABELS = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  earned: 'Earned leave',
  unpaid: 'Unpaid leave',
  other: 'Other leave',
};

export default function EmployeePortal({ user, onLogout }) {
  const [portal, setPortal] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [punching, setPunching] = useState('');
  const [leaveValues, setLeaveValues] = useState({ leaveType: 'casual', startDate: '', endDate: '', reason: '' });
  const [leaveErrors, setLeaveErrors] = useState({});
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [notice, setNotice] = useState('');

  const loadPortal = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [portalResponse, leaveResponse] = await Promise.all([getMyEmployeePortal(), listMyLeave()]);
      setPortal(portalResponse.data);
      setLeaves(leaveResponse.data);
      setLeaveValues((current) => ({
        ...current,
        startDate: current.startDate || portalResponse.data.businessDate,
        endDate: current.endDate || portalResponse.data.businessDate,
      }));
    } catch (requestError) {
      setError(requestError.message || 'Your employee portal could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  const handlePunch = async (type) => {
    setPunching(type);
    setError('');
    setNotice('');

    try {
      const geolocation = await getLocation();
      await punchAttendance({ type, geolocation });
      setNotice(`Punched ${type} successfully.`);
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message || `Could not punch ${type}.`);
    } finally {
      setPunching('');
    }
  };

  const submitLeave = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!leaveValues.startDate) nextErrors.startDate = 'Start date is required.';
    if (!leaveValues.endDate) nextErrors.endDate = 'End date is required.';
    if (leaveValues.startDate && leaveValues.endDate && leaveValues.startDate > leaveValues.endDate) {
      nextErrors.endDate = 'End date cannot be before the start date.';
    }
    if (leaveValues.reason.trim().length < 3) nextErrors.reason = 'Enter a reason of at least 3 characters.';
    if (Object.keys(nextErrors).length > 0) {
      setLeaveErrors(nextErrors);
      return;
    }

    setIsSubmittingLeave(true);
    setError('');
    setNotice('');
    try {
      await createLeaveRequest(leaveValues);
      setLeaveValues((current) => ({ ...current, reason: '' }));
      setNotice('Leave request submitted for administrator approval.');
      await loadPortal();
    } catch (requestError) {
      if (requestError instanceof ApiError) setLeaveErrors(requestError.errors);
      setError(requestError.message || 'Leave request could not be submitted.');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const cancelLeave = async (id) => {
    setError('');
    setNotice('');
    try {
      await cancelLeaveRequest(id);
      setNotice('Leave request cancelled.');
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message || 'Leave request could not be cancelled.');
    }
  };

  if (isLoading && !portal) {
    return <div className="auth-loading" role="status"><span className="spinner" aria-hidden="true" /><span>Loading your employee portal…</span></div>;
  }

  if (!portal) {
    return (
      <div className="member-page">
        <header className="member-topbar"><span className="member-brand"><span className="brand-mark"><Icon name="users" size={21} /></span>PeopleHub</span><button type="button" className="button button-secondary button-small" onClick={onLogout}>Sign out</button></header>
        <main className="member-content"><div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div><button type="button" className="button button-secondary" onClick={loadPortal}>Retry</button></main>
      </div>
    );
  }

  const punchIn = portal.punches.find((punch) => punch.punchType === 'in');
  const punchOut = portal.punches.find((punch) => punch.punchType === 'out');
  const employee = portal.employee;

  return (
    <div className="member-page">
      <header className="member-topbar">
        <a className="member-brand" href="/" aria-label="PeopleHub home"><span className="brand-mark"><Icon name="users" size={21} /></span><span>PeopleHub</span><span className="portal-badge">Portal</span></a>
        <button type="button" className="button button-secondary button-small" onClick={onLogout}><Icon name="logout" size={16} />Sign out</button>
      </header>

      <main className="member-content employee-workspace">
        <section className="page-header member-page-header">
          <div className="page-heading"><p className="eyebrow">Employee portal</p><h1>Welcome, {user.name}</h1><p className="page-description">Manage your attendance and leave requests. Other employee records remain administrator-only.</p></div>
          <span className="role-badge"><Icon name="user" size={15} />Employee</span>
        </section>

        {error && <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
        {notice && <div className="alert alert-success" role="status"><Icon name="check" size={18} /><span>{notice}</span></div>}

        <section className="member-card portal-profile-card" aria-labelledby="member-profile-title">
          <span className="member-avatar">{getInitials(user.name)}</span>
          <div><p className="eyebrow">Your profile</p><h2 id="member-profile-title">{employee.name}</h2></div>
          <dl className="member-details portal-details">
            <div><dt>Email</dt><dd>{employee.email}</dd></div>
            <div><dt>Department</dt><dd>{employee.department}</dd></div>
            <div><dt>Designation</dt><dd>{employee.designation}</dd></div>
            <div><dt>Joining date</dt><dd>{formatDate(employee.joining_date)}</dd></div>
          </dl>
        </section>

        <div className="portal-grid">
          <section className="member-card attendance-card" aria-labelledby="attendance-title">
            <div className="portal-card-heading"><div><p className="eyebrow">Attendance</p><h2 id="attendance-title">Today’s punches</h2></div><span className="role-badge"><Icon name="calendar" size={15} />{formatDate(portal.businessDate)}</span></div>
            <p className="portal-timezone">Business time zone: {portal.timeZone}</p>
            <div className="punch-status-grid">
              <div><span>Punch in</span><strong>{punchIn ? formatDateTime(punchIn.occurredAt) : 'Not recorded'}</strong></div>
              <div><span>Punch out</span><strong>{punchOut ? formatDateTime(punchOut.occurredAt) : 'Not recorded'}</strong></div>
            </div>
            <div className="member-notice"><Icon name="location" size={18} /><span>Your location is captured for each punch. Allow location access and stay within 100 metres accuracy.</span></div>
            <div className="attendance-actions">
              <button type="button" className="button button-primary" onClick={() => handlePunch('in')} disabled={Boolean(punchIn) || Boolean(punching)}>
                {punching === 'in' ? <span className="spinner" aria-hidden="true" /> : <Icon name="clock" size={18} />}
                {punchIn ? 'Punched in' : punching === 'in' ? 'Capturing location…' : 'Punch in'}
              </button>
              <button type="button" className="button button-secondary" onClick={() => handlePunch('out')} disabled={!punchIn || Boolean(punchOut) || Boolean(punching)}>
                {punching === 'out' ? <span className="spinner" aria-hidden="true" /> : <Icon name="clock" size={18} />}
                {punchOut ? 'Punched out' : punching === 'out' ? 'Capturing location…' : 'Punch out'}
              </button>
            </div>
          </section>

          <section className="member-card leave-form-card" aria-labelledby="leave-form-title">
            <div className="portal-card-heading"><div><p className="eyebrow">Time off</p><h2 id="leave-form-title">Apply for leave</h2></div><Icon name="calendar" size={21} /></div>
            <form className="portal-form" onSubmit={submitLeave} noValidate>
              <div className="auth-field"><label htmlFor="leave-type">Leave type</label><select id="leave-type" value={leaveValues.leaveType} onChange={(event) => setLeaveValues((current) => ({ ...current, leaveType: event.target.value }))}>{Object.entries(LEAVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="onboarding-field-grid">
                <div className="auth-field"><label htmlFor="leave-start">Start date</label><input id="leave-start" type="date" value={leaveValues.startDate} onChange={(event) => { setLeaveValues((current) => ({ ...current, startDate: event.target.value })); setLeaveErrors((current) => ({ ...current, startDate: '' })); }} />{leaveErrors.startDate && <p className="field-error">{leaveErrors.startDate}</p>}</div>
                <div className="auth-field"><label htmlFor="leave-end">End date</label><input id="leave-end" type="date" value={leaveValues.endDate} onChange={(event) => { setLeaveValues((current) => ({ ...current, endDate: event.target.value })); setLeaveErrors((current) => ({ ...current, endDate: '' })); }} />{leaveErrors.endDate && <p className="field-error">{leaveErrors.endDate}</p>}</div>
              </div>
              <div className="auth-field"><label htmlFor="leave-reason">Reason</label><textarea id="leave-reason" rows="3" maxLength="1000" value={leaveValues.reason} onChange={(event) => { setLeaveValues((current) => ({ ...current, reason: event.target.value })); setLeaveErrors((current) => ({ ...current, reason: '' })); }} placeholder="Briefly explain your leave request" />{leaveErrors.reason && <p className="field-error">{leaveErrors.reason}</p>}</div>
              <button type="submit" className="button button-primary" disabled={isSubmittingLeave}>{isSubmittingLeave ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={18} />}{isSubmittingLeave ? 'Submitting…' : 'Submit leave request'}</button>
            </form>
          </section>
        </div>

        <section className="member-card portal-list-card" aria-labelledby="leave-list-title">
          <div className="portal-card-heading"><div><p className="eyebrow">Requests</p><h2 id="leave-list-title">Your leave requests</h2></div><span className="record-count">{leaves.length}</span></div>
          {leaves.length === 0 ? (
            <div className="empty-state compact-empty"><Icon name="calendar" size={28} /><h3>No leave requests yet</h3><p>Submitted requests and administrator decisions will appear here.</p></div>
          ) : (
            <div className="table-scroll"><table className="portal-table"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Decision</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{leaves.map((leave) => <tr key={leave.id}><td>{LEAVE_LABELS[leave.leaveType] || leave.leaveType}</td><td>{formatDate(leave.startDate)} – {formatDate(leave.endDate)}</td><td>{leave.dayCount}</td><td><span className={`status-badge status-${leave.status}`}>{leave.status}</span></td><td>{leave.decisionComment || '—'}</td><td>{leave.status === 'pending' && <button type="button" className="button button-secondary button-small" onClick={() => cancelLeave(leave.id)}>Cancel</button>}</td></tr>)}</tbody></table></div>
          )}
        </section>
      </main>
    </div>
  );
}
