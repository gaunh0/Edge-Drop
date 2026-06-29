/** Friendly empty state shown when there's nothing to show. */
import { DropIcon } from './icons'

export function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="empty">
      <DropIcon width={32} height={32} />
      <div className="big">{filtered ? 'No matches' : 'Nothing here yet'}</div>
      <div className="hint">
        {filtered
          ? 'Try a different search, or clear it to see everything.'
          : 'Copy anything, or drag files & images here to fill the shelf.'}
      </div>
    </div>
  )
}
