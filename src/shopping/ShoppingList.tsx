import type { ShoppingCategory } from '../types'
import { formatQuantity } from '../utils/text'
import type { CombinedShoppingItem } from './shoppingViewModel'
import { groupShoppingItems } from './shoppingViewModel'

export function ShoppingList({
  items,
  categories,
  hasChecked,
  onToggle,
  onToggleManual,
  onDeleteManual,
  onAddAgain,
  onClearChecked,
}: {
  items: CombinedShoppingItem[]
  categories: ShoppingCategory[]
  hasChecked: boolean
  onToggle: (lineId: string) => void
  onToggleManual: (id: string) => void
  onDeleteManual: (id: string) => void
  onAddAgain: (name: string, categoryId: string | null) => void
  onClearChecked: () => void
}) {
  const toBuyItems = items.filter((item) => !item.checked)
  const purchasedItems = items.filter((item) => item.checked)

  function renderItem(item: CombinedShoppingItem) {
    const sourceDescription = item.kind === 'meal'
      ? `${formatQuantity(item.totalQuantity)} ${item.unit} · meal plan`
      : 'Added separately'
    const itemDescription = item.kind === 'meal' ? `${item.name} from meal plan` : `manually added ${item.name}`

    return (
      <div className={`shopping-item unified-shopping-item ${item.kind}-shopping-item ${item.checked ? 'checked' : ''}`} key={`${item.kind}-${item.id}`}>
        <label className="shopping-item-toggle">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => item.kind === 'meal' ? onToggle(item.id) : onToggleManual(item.id)}
            aria-label={`Mark ${itemDescription} ${item.checked ? 'needed' : 'purchased'}`}
          />
          <span className="checkmark" />
          <span className="shopping-item-copy">
            <span className="shopping-name">{item.name}</span>
            <small>{sourceDescription}</small>
          </span>
        </label>
        <div className="shopping-item-actions">
          {item.checked && <button className="shopping-add-again" type="button" onClick={() => onAddAgain(item.name, item.categoryId)} aria-label={`Add ${item.name} again`}>+ Again</button>}
          {item.kind === 'manual' && <button className="shopping-delete" type="button" onClick={() => onDeleteManual(item.id)} aria-label={`Delete ${item.name}`}>×</button>}
        </div>
      </div>
    )
  }

  function renderGroups(groupItems: CombinedShoppingItem[]) {
    return groupShoppingItems(groupItems, categories).map((group) => (
      <div className="shopping-category-group" key={group.id}>
        <div className="shopping-category-label">
          <span>{group.name}</span>
          <small>{group.items.length}</small>
        </div>
        {group.items.map(renderItem)}
      </div>
    ))
  }

  return (
    <div className="shopping-list categorized-shopping-list">
      {toBuyItems.length > 0 && (
        <>
          <div className="shopping-group-label"><span>To buy</span><small>{toBuyItems.length}</small></div>
          {renderGroups(toBuyItems)}
        </>
      )}
      {purchasedItems.length > 0 && (
        <>
          <div className="shopping-group-label purchased-group-label">
            <span>Purchased</span>
            <div className="purchased-group-actions">
              <small>{purchasedItems.length}</small>
              {hasChecked && <button type="button" onClick={onClearChecked} title="Move every purchased item back to To buy">Mark all needed</button>}
            </div>
          </div>
          {purchasedItems.map(renderItem)}
        </>
      )}
    </div>
  )
}
