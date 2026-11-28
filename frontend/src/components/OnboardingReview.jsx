import { useCallback, useEffect, useState } from 'react';
import {
  decideOnboardingApplication,
  getOnboardingReview,
  listOnboardingApplications,
  verifyOnboardingDocument,
} from '../api.js';
import { formatDateTime } from '../utils/format.js';
import { buildApiUrl } from '../utils/url.js';
import Icon from './Icon.jsx';
import Pagination from './Pagination.jsx';

const DOCUMENT_LABELS = {
  aadhaar: 'Aadhaar',
  pan: 'PAN card',
  bank_book: 'Bank book / statement',
};

export default function OnboardingReview() {
  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('submitted');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [action, setAction] = useState('');
  const [comment, setComment] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await listOnboardingApplications({ page, pageSize: 10, status, q: search });
      setApplications(response.data);
      setPagination(response.pagination);
      if (response.pagination.totalPages > 0 && page > response.pagination.totalPages) setPage(response.pagination.totalPages);
    } catch (requestError) {
      setError(requestError.message || 'Onboarding applications could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    loadApplications();
    return () => controller.abort();
  }, [loadApplications, reloadKey]);

  const openApplication = async (id) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError('');
    setComment('');
    try {
      const response = await getOnboardingReview(id);
      setDetail(response.data);
    } catch (requestError) {
      setDetailError(requestError.message || 'Application details could not be loaded.');
    }
  };

  const verifyDocument = async (type, decision) => {
    const reason = decision === 'rejected' ? window.prompt('Reason for rejecting this document:') : '';
    if (decision === 'rejected' && !reason?.trim()) return;
    setAction(`${type}:${decision}`);
    setDetailError('');
    try {
      const response = await verifyOnboardingDocument(selectedId, type, { decision, reason: reason?.trim() || '' });
      setDetail(response.data);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setDetailError(requestError.message || 'The document decision could not be saved.');
    } finally {
      setAction('');
    }
  };

  const decide = async (decision) => {
    setAction(`application:${decision}`);
    setDetailError('');
    try {
      const response = await decideOnboardingApplication(selectedId, { decision, comment });
      setDetail(response.data);
      setComment('');
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setDetailError(requestError.message || 'The onboarding decision could not be saved.');
    } finally {
      setAction('');
    }
  };

  const allVerified = Boolean(detail?.documents?.length === 3 && detail.documents.every((document) => document.verificationStatus === 'verified'));
  const decided = detail?.accountStatus === 'active' || detail?.accountStatus === 'blocked';

  return (
    <section className="review-workspace" aria-labelledby="onboarding-review-title">
      <div className="review-toolbar">
        <div className="search-field"><Icon name="search" size={18} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by employee or email…" aria-label="Search onboarding applications" /></div>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter application status"><option value="submitted">Submitted</option><option value="draft">Drafts</option><option value="expired">Expired</option></select>
      </div>

      {error && <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span><button type="button" className="button button-secondary button-small" onClick={loadApplications}>Retry</button></div>}

      <div className="review-layout">
        <div className="directory-card review-list-card">
          <div className="directory-header"><div className="directory-heading"><div><h2 id="onboarding-review-title">Onboarding applications</h2><p>Verify private documents before enabling employee sign-in.</p></div><span className="record-count">{pagination.total}</span></div></div>
          {isLoading && applications.length === 0 ? (
            <div className="empty-state"><span className="spinner" aria-hidden="true" /><p>Loading applications…</p></div>
          ) : applications.length === 0 ? (
            <div className="empty-state"><Icon name="form" size={30} /><h3>No applications found</h3><p>New employee submissions will appear here.</p></div>
          ) : (
            <div className="table-scroll"><table className="portal-table review-table"><thead><tr><th>Employee</th><th>Submitted</th><th>Documents</th><th>Account</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{applications.map((application) => <tr key={application.applicationId} className={selectedId === application.applicationId ? 'is-selected' : ''}><td><strong>{application.name}</strong><small>{application.email}</small></td><td>{formatDateTime(application.submittedAt)}</td><td>{application.verifiedCount} / {application.documentCount} verified</td><td><span className={`status-badge status-${application.accountStatus || application.status}`}>{application.accountStatus || application.status}</span></td><td><button type="button" className="button button-secondary button-small" onClick={() => openApplication(application.applicationId)}>Review</button></td></tr>)}</tbody></table></div>
          )}
          <footer className="directory-footer"><p>Submitted employee applications</p><Pagination pagination={pagination} page={page} limit={10} onPageChange={setPage} disabled={isLoading} label="Onboarding application pages" /></footer>
        </div>

        <aside className="member-card review-detail-card" aria-live="polite">
          {!selectedId ? (
            <div className="empty-state compact-empty"><Icon name="shield" size={30} /><h3>Select an application</h3><p>Review profile details and verify each private document.</p></div>
          ) : detailError && !detail ? (
            <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{detailError}</span></div>
          ) : !detail ? (
            <div className="empty-state compact-empty"><span className="spinner" aria-hidden="true" /><p>Loading application…</p></div>
          ) : (
            <>
              <div className="portal-card-heading"><div><p className="eyebrow">Application review</p><h2>{detail.profile.name}</h2></div><button type="button" className="icon-button" onClick={() => { setSelectedId(''); setDetail(null); }} aria-label="Close application"><Icon name="x" size={18} /></button></div>
              {detailError && <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /><span>{detailError}</span></div>}
              <dl className="member-details review-profile">
                <div><dt>Email</dt><dd>{detail.email}</dd></div>
                <div><dt>Phone</dt><dd>{detail.profile.phone}</dd></div>
                <div><dt>Department</dt><dd>{detail.profile.department}</dd></div>
                <div><dt>Designation</dt><dd>{detail.profile.designation}</dd></div>
                <div><dt>Joining date</dt><dd>{detail.profile.joining_date}</dd></div>
                <div><dt>Submitted</dt><dd>{formatDateTime(detail.submittedAt)}</dd></div>
              </dl>

              <h3 className="review-section-title">Document verification</h3>
              <div className="review-documents">
                {detail.documents.map((document) => (
                  <div className="review-document" key={document.documentType}>
                    <div><strong>{DOCUMENT_LABELS[document.documentType]}</strong><small>{document.uploaded ? `${document.format?.toUpperCase()} · ${Math.ceil(document.bytes / 1024)} KB` : 'Not uploaded'}</small>{document.rejectionReason && <p className="field-error">{document.rejectionReason}</p>}</div>
                    <div className="review-document-actions">
                      {document.downloadPath && <a className="button button-secondary button-small" href={buildApiUrl(document.downloadPath)} target="_blank" rel="noreferrer"><Icon name="download" size={15} />View</a>}
                      {document.uploaded && <><button type="button" className="button button-primary button-small" disabled={Boolean(action) || document.verificationStatus === 'verified'} onClick={() => verifyDocument(document.documentType, 'verified')}>{action === `${document.documentType}:verified` ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={15} />}Verify</button><button type="button" className="button button-secondary button-small" disabled={Boolean(action) || document.verificationStatus === 'rejected'} onClick={() => verifyDocument(document.documentType, 'rejected')}>Reject</button></>}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="review-section-title">Final decision</h3>
              <div className="auth-field"><label htmlFor="onboarding-decision-comment">Decision comment</label><textarea id="onboarding-decision-comment" rows="2" maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional note for the employee record" /></div>
              <div className="onboarding-actions">
                <button type="button" className="button button-secondary" disabled={Boolean(action) || decided} onClick={() => decide('rejected')}>Reject application</button>
                <button type="button" className="button button-primary" disabled={Boolean(action) || decided || !allVerified} onClick={() => decide('approved')}><Icon name="check" size={18} />Approve & activate</button>
              </div>
              {!allVerified && !decided && <p className="field-help">Approve becomes available after all three documents are verified.</p>}
              {decided && <div className="alert alert-success" role="status"><Icon name="check" size={18} /><span>{detail.accountStatus === 'active' ? 'Approved. Employee sign-in is active.' : 'Rejected. Employee sign-in remains blocked.'}</span></div>}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
