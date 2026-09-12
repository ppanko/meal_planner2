import type { ShoppingCategory, ShoppingHistoryItem } from '../types'
import { formatHistoryDate } from './shoppingUtils'

export function ShoppingHistory({ history, categories, totalCount, search, onSearchChange, neededNames, onAdd, onDelete }: {
  history: ShoppingHistoryItem[]
  categories: ShoppingCategory[]
  totalCount: number
  search: string
  onSearchChange: (value: string) => void
  neededNames: Set<string>
  onAdd: (name: string, categoryId: string | null) => void
  onDelete: (id: string) => void
}) {
  const categoryIds = new Set(categories.map((category) => category.id))
  const groups = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: history
        .filter((item) => item.shoppingCategoryId === category.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.items.length > 0)
  const uncategorized = history
    .filter((item) => !item.shoppingCategoryId || !categoryIds.has(item.shoppingCategoryId))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (uncategorized.length > 0) {
    groups.push({ id: '__uncategorized__', name: 'Uncategorized', items: uncategorized })
  }

  function renderItem(item: ShoppingHistoryItem) {
    const isNeeded = neededNames.has(item.name.trim().toLowerCase())
    return (
      <div className="history-row" key={item.id}>
        <div><strong>{item.name}</strong><small>Last purchased {formatHistoryDate(item.lastPurchasedAt)}</small></div>
        <button className="history-add" type="button" disabled={isNeeded} onClick={() => onAdd(item.name, item.shoppingCategoryId ?? null)}>{isNeeded ? 'On list' : '+ Add again'}</button>
        <button className="history-delete" type="button" onClick={() => onDelete(item.id)} aria-label={`Remove ${item.name} from past items`} title="Remove from history">×</button>
      </div>
    )
  }

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
          {groups.map((group) => (
            <div className="history-group" key={group.id}>
              <div className="shopping-category-label" role="heading" aria-level={4}>
                <span>{group.name}</span>
                <small>{group.items.length}</small>
              </div>
              {group.items.map(renderItem)}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
