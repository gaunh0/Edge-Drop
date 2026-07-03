/** Friendly empty state shown when there's nothing to show. */

export function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="empty">
      <div className="empty-text">
        <div className="big">{filtered ? 'No results found' : 'Shelf is empty'}</div>
        <div className="hint">
          {filtered
            ? 'Try a different keyword or clear search'
            : 'Copy anything or drop files here to begin'}
        </div>
      </div>
    </div>
  )
}
