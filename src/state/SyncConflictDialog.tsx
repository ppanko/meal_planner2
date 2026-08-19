import type { SyncConflict } from '../sync/syncTypes'

function conflictSummary(path: string) {
  const meal = path.match(/^meals\[([^\]]+)](?:\.(.+))?$/)
  if (meal) return meal[2] ? `Meal field: ${meal[2]}` : 'Meal deleted or edited'
  if (path.startsWith('planner.')) return 'The same planner slot'
  if (path.startsWith('manualShoppingItems.')) return 'The same shopping item'
  if (path.startsWith('shoppingPurchasesByWeek.')) return 'The same purchase status'
  return 'The same saved information'
}

export function SyncConflictDialog({ conflict, onResolve, onDefer }: {
  conflict: SyncConflict
  onResolve: (resolution: 'latest' | 'device' | 'copy') => void
  onDefer: () => void
}) {
  const summaries = [...new Set(conflict.paths.map(conflictSummary))]

  return (
    <div className="modal-backdrop sync-conflict-backdrop">
      <div className="modal sync-conflict-modal" role="alertdialog" aria-modal="true" aria-labelledby="sync-conflict-title" aria-describedby="sync-conflict-description">
        <div className="eyebrow">SYNC NEEDS ATTENTION</div>
        <h2 id="sync-conflict-title">Changes overlap</h2>
        <p id="sync-conflict-description">
          Another device changed the same information. Unrelated changes have already been combined.
        </p>
        <ul>{summaries.slice(0, 3).map((summary) => <li key={summary}>{summary}</li>)}</ul>
        <div className="modal-actions sync-conflict-actions">
          <button type="button" className="secondary" onClick={onDefer} autoFocus>Decide later</button>
          <button type="button" className="secondary" onClick={() => onResolve('latest')}>Use latest</button>
          <button type="button" className="primary" onClick={() => onResolve(conflict.canSaveMealCopy ? 'copy' : 'device')}>
            {conflict.canSaveMealCopy ? 'Save mine as a copy' : 'Keep this device'}
          </button>
        </div>
      </div>
    </div>
  )
}
