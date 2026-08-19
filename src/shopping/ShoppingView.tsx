import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Ingredient, ManualShoppingItem, ShoppingCategory, ShoppingHistoryItem, ShoppingItem } from '../types'
import { formatRange } from '../utils/dates'
import { formatQuantity } from '../utils/text'
import { defaultShoppingCategoryIds, formatHistoryDate } from './shoppingUtils'

export function ShoppingView({
  shopping,
  manualItems,
  onToggle,
  onAddManual,
  onToggleManual,
  onDeleteManual,
  onClearChecked,
  history,
  onAddHistory,
  onDeleteHistory,
  weekDates,
  weekOffset,
  setWeekOffset,
  ingredients,
  shoppingCategories,
  onSetItemCategory,
  onAddShoppingCategory,
  onMoveShoppingCategory,
  onDeleteShoppingCategory,
}: {
  shopping: ShoppingItem[]
  manualItems: ManualShoppingItem[]
  onToggle: (lineId: string) => void
  onAddManual: (name: string) => void
  onToggleManual: (id: string) => void
  onDeleteManual: (id: string) => void
  onClearChecked: () => void
  history: ShoppingHistoryItem[]
  onAddHistory: (name: string, shoppingCategoryId?: string | null) => void
  onDeleteHistory: (id: string) => void
  weekDates: Date[]
  weekOffset: number
  setWeekOffset: (n: number) => void
  ingredients: Ingredient[]
  shoppingCategories: ShoppingCategory[]
  onSetItemCategory: (ingredientId: string | null, manualIds: string[], categoryId: string | null) => void
  onAddShoppingCategory: (name: string) => void
  onMoveShoppingCategory: (categoryId: string, direction: -1 | 1) => void
  onDeleteShoppingCategory: (categoryId: string) => void
}) {
  type CombinedShoppingItem =
    | {
        kind: 'meal'
        id: string
        ingredientId: string
        name: string
        checked: boolean
        unit: string
        quantity: number
        categoryId: string | null
      }
    | {
        kind: 'manual'
        id: string
        name: string
        checked: boolean
        ingredientId: string | null
        unit: string
        quantity: number | null
        categoryId: string | null
      }

  type ShoppingGroup = {
    id: string
    name: string
    items: CombinedShoppingItem[]
  }

  type CategoryItem = {
    key: string
    name: string
    ingredientId: string | null
    manualIds: string[]
    categoryId: string | null
  }

  const [newItem, setNewItem] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [itemSearch, setItemSearch] = useState('')

  const remaining =
    shopping.filter((i) => !i.checked).length +
    manualItems.filter((i) => !i.checked).length

  const hasItems = shopping.length > 0 || manualItems.length > 0
  const hasChecked =
    shopping.some((item) => item.checked) ||
    manualItems.some((item) => item.checked)

  const combinedShoppingItems = useMemo<CombinedShoppingItem[]>(() => {
    const mealItems: CombinedShoppingItem[] = shopping.map((item) => ({
      kind: 'meal',
      id: item.lineId,
      ingredientId: item.ingredientId,
      name: item.name,
      checked: item.checked,
      unit: item.unit,
      quantity: item.quantity,
      categoryId: item.shoppingCategoryId ?? null,
    }))

    const manual: CombinedShoppingItem[] = manualItems.map((item) => ({
      kind: 'manual',
      id: item.id,
      name: item.name,
      checked: item.checked,
      ingredientId: item.ingredientId ?? null,
      unit: item.unit ?? '',
      quantity: item.quantity ?? null,
      categoryId: item.shoppingCategoryId ?? null,
    }))

    return [...mealItems, ...manual].sort((a, b) => a.name.localeCompare(b.name))
  }, [shopping, manualItems])

  const toBuyItems = combinedShoppingItems.filter((item) => !item.checked)
  const purchasedItems = combinedShoppingItems.filter((item) => item.checked)
  const neededNames = new Set(toBuyItems.map((item) => item.name.trim().toLowerCase()))

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase()

    return [...history]
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const dateDiff =
          new Date(b.lastPurchasedAt).getTime() -
          new Date(a.lastPurchasedAt).getTime()

        return dateDiff || a.name.localeCompare(b.name)
      })
  }, [history, historySearch])

  const suggestedNames = useMemo(() => [...new Set([
    ...ingredients.map((ingredient) => ingredient.name.trim()),
    ...history.map((item) => item.name.trim()),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [ingredients, history])

  const categoryItems = useMemo<CategoryItem[]>(() => {
    const byName = new Map<string, CategoryItem>()

    for (const ingredient of ingredients) {
      byName.set(ingredient.name.trim().toLowerCase(), {
        key: `ingredient-${ingredient.id}`,
        name: ingredient.name,
        ingredientId: ingredient.id,
        manualIds: [],
        categoryId: ingredient.shoppingCategoryId ?? null,
      })
    }

    for (const item of manualItems) {
      const normalized = item.name.trim().toLowerCase()
      const linkedIngredient = item.ingredientId
        ? ingredients.find((ingredient) => ingredient.id === item.ingredientId)
        : ingredients.find((ingredient) => ingredient.name.trim().toLowerCase() === normalized)
      const key = linkedIngredient?.name.trim().toLowerCase() ?? normalized
      const existing = byName.get(key)

      if (existing) {
        existing.manualIds.push(item.id)
      } else {
        byName.set(key, {
          key: `manual-${item.id}`,
          name: item.name,
          ingredientId: null,
          manualIds: [item.id],
          categoryId: item.shoppingCategoryId ?? null,
        })
      }
    }

    const query = itemSearch.trim().toLowerCase()
    return [...byName.values()]
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [ingredients, manualItems, itemSearch])

  function groupShoppingItems(items: CombinedShoppingItem[]): ShoppingGroup[] {
    const groups: ShoppingGroup[] = shoppingCategories.map((category) => ({
      id: category.id,
      name: category.name,
      items: items.filter((item) => item.categoryId === category.id),
    }))

    const validCategoryIds = new Set(shoppingCategories.map((category) => category.id))
    const uncategorized = items.filter(
      (item) => !item.categoryId || !validCategoryIds.has(item.categoryId),
    )

    if (uncategorized.length > 0) {
      groups.push({ id: '__uncategorized__', name: 'Uncategorized', items: uncategorized })
    }

    return groups.filter((group) => group.items.length > 0)
  }

  function renderShoppingItem(item: CombinedShoppingItem) {
    return (
      <div
        className={`shopping-item unified-shopping-item ${item.checked ? 'checked' : ''}`}
        key={`${item.kind}-${item.id}`}
      >
        <label className="shopping-item-toggle">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => item.kind === 'meal' ? onToggle(item.id) : onToggleManual(item.id)}
            aria-label={`Mark ${item.name} ${item.checked ? 'needed' : 'purchased'}`}
          />
          <span className="checkmark" />
          <span className="shopping-name">{item.name}</span>
        </label>
        <div className="shopping-item-actions">
          {item.quantity !== null && <strong>{formatQuantity(item.quantity)} {item.unit}</strong>}
          {item.checked && <button className="shopping-add-again" type="button" onClick={() => onAddHistory(item.name, item.categoryId)} aria-label={`Add ${item.name} again`}>+ Again</button>}
          {item.kind === 'manual' && <button className="shopping-delete" type="button" onClick={() => onDeleteManual(item.id)} aria-label={`Delete ${item.name}`}>×</button>}
        </div>
      </div>
    )
  }

  function renderShoppingGroups(items: CombinedShoppingItem[]) {
    return groupShoppingItems(items).map((group) => (
      <div className="shopping-category-group" key={group.id}>
        <div className="shopping-category-label">
          <span>{group.name}</span>
          <small>{group.items.length}</small>
        </div>
        {group.items.map(renderShoppingItem)}
      </div>
    ))
  }

  function submitManualItem(event: FormEvent) {
    event.preventDefault()
    const trimmed = newItem.trim()
    if (!trimmed) return

    onAddManual(trimmed)
    setNewItem('')
  }

  function submitCategory(event: FormEvent) {
    event.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    onAddShoppingCategory(trimmed)
    setNewCategoryName('')
  }

  return (
    <section>
      <div className="section-header shopping-section-header">
        <div>
          <div className="eyebrow">SHOPPING</div>
          <h2>{formatRange(weekDates)}</h2>
        </div>

        <div className="shopping-header-controls">
          <button
            type="button"
            className="secondary shopping-organize-button"
            onClick={() => setShowCategoryManager(true)}
          >
            Organize categories
          </button>
          <div className="week-controls">
            <button onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
            <button onClick={() => setWeekOffset(0)}>Today</button>
            <button onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
          </div>
        </div>
      </div>

      <div className="shopping-layout">
        <div className="shopping-current">
          <form className="shopping-add" onSubmit={submitManualItem}>
            <input
              type="text"
              list="shopping-item-suggestions"
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add an item—or add more of something…"
              aria-label="Add shopping list item"
            />
            <datalist id="shopping-item-suggestions">
              {suggestedNames.map((name) => <option value={name} key={name} />)}
            </datalist>
            <button className="primary" type="submit">Add</button>
          </form>

          {!hasItems ? (
            <div className="empty-state">
              <h3>Shopping list is empty</h3>
              <p>Add an item above, reuse a past item, or plan meals for this week.</p>
            </div>
          ) : (
            <>
              <p className="shopping-summary">
                {remaining} item{remaining === 1 ? '' : 's'} remaining
              </p>

              <div className="shopping-list categorized-shopping-list">
                {toBuyItems.length > 0 && (
                  <>
                    <div className="shopping-group-label">
                      <span>To buy</span>
                      <small>{toBuyItems.length}</small>
                    </div>
                    {renderShoppingGroups(toBuyItems)}
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
                    {purchasedItems.map(renderShoppingItem)}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="shopping-history">
          <div className="shopping-history-header">
            <div>
              <div className="eyebrow">QUICK ADD</div>
              <h3>Purchased before</h3>
            </div>
            <span>{history.length}</span>
          </div>

          <input
            className="history-search"
            type="search"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search past items…"
            aria-label="Search past shopping items"
          />

          {filteredHistory.length === 0 ? (
            <div className="history-empty">
              Checked-off shopping items will appear here for quick reuse.
            </div>
          ) : (
            <div className="history-table">
              {filteredHistory.map((item) => (
                <div className="history-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      Last purchased {formatHistoryDate(item.lastPurchasedAt)}
                    </small>
                  </div>

                  <button className="history-add" type="button" disabled={neededNames.has(item.name.trim().toLowerCase())} onClick={() => onAddHistory(item.name, item.shoppingCategoryId ?? null)}>
                    {neededNames.has(item.name.trim().toLowerCase()) ? 'On list' : '+ Add again'}
                  </button>

                  <button
                    className="history-delete"
                    type="button"
                    onClick={() => onDeleteHistory(item.id)}
                    aria-label={`Remove ${item.name} from past items`}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {showCategoryManager && (
        <div className="modal-backdrop" onClick={() => setShowCategoryManager(false)}>
          <div
            className="modal shopping-category-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shopping-category-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">SHOPPING ORGANIZATION</div>
                <h2 id="shopping-category-title">Organize categories</h2>
              </div>
              <button type="button" onClick={() => setShowCategoryManager(false)} aria-label="Close">×</button>
            </div>

            <section className="shopping-category-manager-section">
              <div className="shopping-category-manager-heading">
                <div>
                  <h3>Store order</h3>
                  <p>Move categories into the order you usually walk through the store.</p>
                </div>
              </div>

              <div className="shopping-category-order-list">
                {shoppingCategories.map((category, index) => (
                  <div className="shopping-category-order-row" key={category.id}>
                    <span>{category.name}</span>
                    <div className="shopping-category-order-actions">
                      <button
                        type="button"
                        onClick={() => onMoveShoppingCategory(category.id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${category.name} up`}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveShoppingCategory(category.id, 1)}
                        disabled={index === shoppingCategories.length - 1}
                        aria-label={`Move ${category.name} down`}
                        title="Move down"
                      >
                        ↓
                      </button>
                      {!defaultShoppingCategoryIds.has(category.id) && (
                        <button
                          type="button"
                          className="shopping-category-delete"
                          onClick={() => onDeleteShoppingCategory(category.id)}
                          aria-label={`Delete ${category.name} shopping category`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form className="shopping-category-add" onSubmit={submitCategory}>
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Custom category, e.g. Bakery"
                  aria-label="New shopping category"
                />
                <button type="submit" className="secondary">Add category</button>
              </form>
            </section>

            <section className="shopping-category-manager-section item-category-section">
              <div className="shopping-category-manager-heading">
                <div>
                  <h3>Item categories</h3>
                  <p>Set where each item belongs. Its category will be reused automatically.</p>
                </div>
              </div>

              <input
                className="shopping-category-ingredient-search"
                type="search"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search items…"
                aria-label="Search items to categorize"
              />

              <div className="shopping-category-ingredient-list">
                {categoryItems.length > 0 ? (
                  categoryItems.map((item) => (
                    <label className="shopping-category-ingredient-row" key={item.key}>
                      <span>{item.name}</span>
                      <select
                        value={item.categoryId ?? ''}
                        onChange={(event) =>
                          onSetItemCategory(item.ingredientId, item.manualIds, event.target.value || null)
                        }
                        aria-label={`Shopping category for ${item.name}`}
                      >
                        <option value="">Uncategorized</option>
                        {shoppingCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                  ))
                ) : (
                  <div className="ingredient-manager-empty">No items match your search.</div>
                )}
              </div>
            </section>

            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setShowCategoryManager(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
