import type { SyncStatus } from '../sync/syncTypes'

const labels: Record<SyncStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline · saved here',
  conflict: 'Review changes',
}

export function SyncStatusIndicator({ status, onReview }: {
  status: SyncStatus
  onReview: () => void
}) {
  if (status === 'conflict') {
    return (
      <button className="sync-status conflict" type="button" onClick={onReview}>
        <span aria-hidden="true" />{labels[status]}
      </button>
    )
  }

  return (
    <div className={`sync-status ${status}`} role="status" aria-live="polite">
      <span aria-hidden="true" />{labels[status]}
    </div>
  )
}
