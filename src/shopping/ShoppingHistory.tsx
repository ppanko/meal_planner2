import type { ShoppingHistoryItem } from '../types'
import { formatHistoryDate } from './shoppingUtils'

export function ShoppingHistory({ history, totalCount, search, onSearchChange, neededNames, onAdd, onDelete }: {
  history: ShoppingHistoryItem[]
  totalCount: number
  search: string
  onSearchChange: (value: string) => void
  neededNames: Set<string>
  onAdd: (name: string, categoryId: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <aside className="shopping-history">
      <div className="shopping-history-header">
        <div><div className="eyebrow">QUICK ADD</div><h3>Purchased before</h3></div>
        <span>{totalCount}</span>
      </div>
      <input className="history-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search past items…" aria-label="Search past shopping items" />
      {history.length === 0 ? (
        <div className="history-empty">Checked-off shopping items will appear here for quick reuse.</div>
      ) : (
        <div className="history-table">
          {history.map((item) => {
            const isNeeded = neededNames.has(item.name.trim().toLowerCase())
            return (
              <div className="history-row" key={item.id}>
                <div><strong>{item.name}</strong><small>Last purchased {formatHistoryDate(item.lastPurchasedAt)}</small></div>
                <button className="history-add" type="button" disabled={isNeeded} onClick={() => onAdd(item.name, item.shoppingCategoryId ?? null)}>{isNeeded ? 'On list' : '+ Add again'}</button>
                <button className="history-delete" type="button" onClick={() => onDelete(item.id)} aria-label={`Remove ${item.name} from past items`} title="Remove from history">×</button>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
