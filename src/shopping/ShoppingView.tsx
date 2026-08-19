import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { defaultShoppingCategories } from '../types'
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
  onSetManualCategory,
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
  onSetIngredientCategory,
  onAddShoppingCategory,
  onMoveShoppingCategory,
  onDeleteShoppingCategory,
}: {
  shopping: ShoppingItem[]
  manualItems: ManualShoppingItem[]
  onToggle: (lineId: string) => void
  onAddManual: (name: string) => void
  onToggleManual: (id: string) => void
  onSetManualCategory: (id: string, categoryId: string | null) => void
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
  onSetIngredientCategory: (ingredientId: string, categoryId: string | null) => void
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
        unit: ''
        quantity: null
        categoryId: string | null
      }

  type ShoppingGroup = {
    id: string
    name: string
    items: CombinedShoppingItem[]
  }

  const [newItem, setNewItem] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')

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
      unit: '',
      quantity: null,
      categoryId: item.shoppingCategoryId ?? null,
    }))

    return [...mealItems, ...manual].sort((a, b) => a.name.localeCompare(b.name))
  }, [shopping, manualItems])

  const toBuyItems = combinedShoppingItems.filter((item) => !item.checked)
  const purchasedItems = combinedShoppingItems.filter((item) => item.checked)

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

  const filteredIngredients = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase()
    return [...ingredients]
      .filter((ingredient) => !query || ingredient.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [ingredients, ingredientSearch])

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
    if (item.kind === 'meal') {
      return (
        <label
          className={`shopping-item ${item.checked ? 'checked' : ''}`}
          key={`meal-${item.id}`}
        >
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => onToggle(item.id)}
          />
          <span className="checkmark" />
          <span className="shopping-name">
            {item.name}
            {item.checked ? (
              <small className="shopping-status">Purchased</small>
            ) : item.id.startsWith('outstanding:') ? (
              <small className="shopping-status">Additional</small>
            ) : null}
          </span>
          <strong>
            {formatQuantity(item.quantity)} {item.unit}
          </strong>
        </label>
      )
    }

    return (
      <div
        className={`shopping-item manual-shopping-item ${item.checked ? 'checked' : ''}`}
        key={`manual-${item.id}`}
      >
        <input
          className="manual-shopping-checkbox"
          type="checkbox"
          checked={item.checked}
          onChange={() => onToggleManual(item.id)}
          aria-label={`Mark ${item.name} ${item.checked ? 'not purchased' : 'purchased'}`}
        />
        <span className="checkmark" onClick={() => onToggleManual(item.id)} />
        <span className="shopping-name" onClick={() => onToggleManual(item.id)}>
          {item.name}
        </span>
        <div className="manual-shopping-actions">
          {!item.checked && (
            <select
              className="manual-shopping-category"
              value={item.categoryId ?? ''}
              onChange={(event) => onSetManualCategory(item.id, event.target.value || null)}
              aria-label={`Shopping category for ${item.name}`}
            >
              <option value="">Uncategorized</option>
              {shoppingCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          )}
          <button
            className="shopping-delete"
            type="button"
            onClick={() => onDeleteManual(item.id)}
            aria-label={`Delete ${item.name}`}
          >
            ×
          </button>
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
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add anything to the shopping list…"
              aria-label="Add shopping list item"
            />
            <button className="primary" type="submit">Add</button>
          </form>

          {hasChecked && (
            <div style={{ marginBottom: 14 }}>
              <button className="secondary" onClick={onClearChecked}>Clear checks</button>
            </div>
          )}

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
                      <small>{purchasedItems.length}</small>
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
              <div className="eyebrow">PAST ITEMS</div>
              <h3>Previously purchased</h3>
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

                  <button
                    className="history-add"
                    type="button"
                    onClick={() => onAddHistory(item.name, item.shoppingCategoryId ?? null)}
                  >
                    + Add
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

            <section className="shopping-category-manager-section ingredient-category-section">
              <div className="shopping-category-manager-heading">
                <div>
                  <h3>Ingredient categories</h3>
                  <p>Each ingredient keeps this category for future shopping lists.</p>
                </div>
              </div>

              <input
                className="shopping-category-ingredient-search"
                type="search"
                value={ingredientSearch}
                onChange={(event) => setIngredientSearch(event.target.value)}
                placeholder="Search ingredients…"
                aria-label="Search ingredients to categorize"
              />

              <div className="shopping-category-ingredient-list">
                {filteredIngredients.length > 0 ? (
                  filteredIngredients.map((ingredient) => (
                    <label className="shopping-category-ingredient-row" key={ingredient.id}>
                      <span>{ingredient.name}</span>
                      <select
                        value={ingredient.shoppingCategoryId ?? ''}
                        onChange={(event) =>
                          onSetIngredientCategory(ingredient.id, event.target.value || null)
                        }
                      >
                        <option value="">Uncategorized</option>
                        {shoppingCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                  ))
                ) : (
                  <div className="ingredient-manager-empty">No ingredients match your search.</div>
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
