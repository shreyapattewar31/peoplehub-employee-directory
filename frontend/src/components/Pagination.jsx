import Icon from './Icon.jsx';

export default function Pagination({
  pagination,
  page,
  limit,
  onPageChange,
  onLimitChange,
  disabled = false,
  label = 'Pages',
}) {
  if (!pagination) {
    return null;
  }

  const hasPages = pagination.totalPages > 0;

  return (
    <div className="pagination-wrap">
      {onLimitChange && (
        <label className="page-size-control">
          <span>Rows per page</span>
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            disabled={disabled}
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      )}
      {hasPages && (
        <nav className="pagination" aria-label={label}>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || disabled}
          >
            <Icon name="chevronLeft" size={16} />
            Previous
          </button>
          <span className="page-number">{pagination.page}</span>
          <span className="page-total">of {pagination.totalPages}</span>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pagination.totalPages || disabled}
          >
            Next
            <Icon name="chevronRight" size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
