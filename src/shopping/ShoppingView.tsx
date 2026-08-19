import { useMemo, useState } from 'react'
import type { Ingredient, ManualShoppingItem, ShoppingCategory, ShoppingHistoryItem, ShoppingItem } from '../types'
import { formatRange } from '../utils/dates'
import { ShoppingAddCombobox } from './ShoppingAddCombobox'
import { ShoppingCategoryDialog } from './ShoppingCategoryDialog'
import { ShoppingHistory } from './ShoppingHistory'
import { ShoppingList } from './ShoppingList'
import { buildCategoryItems, combineShoppingItems, filterShoppingHistory, getShoppingSuggestions } from './shoppingViewModel'

export type ShoppingViewProps = {
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
}

export function ShoppingView(props: ShoppingViewProps) {
  const [newItem, setNewItem] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [itemSearch, setItemSearch] = useState('')

  const items = useMemo(
    () => combineShoppingItems(props.shopping, props.manualItems, props.ingredients),
    [props.shopping, props.manualItems, props.ingredients],
  )
  const toBuyItems = items.filter((item) => !item.checked)
  const manualNeededNames = useMemo(
    () => new Set(
      props.manualItems
        .filter((item) => !item.checked)
        .map((item) => item.name.trim().toLowerCase()),
    ),
    [props.manualItems],
  )
  const filteredHistory = useMemo(() => filterShoppingHistory(props.history, historySearch), [props.history, historySearch])
  const suggestions = useMemo(
    () => getShoppingSuggestions(newItem, props.ingredients, props.history, manualNeededNames),
    [newItem, props.ingredients, props.history, manualNeededNames],
  )
  const categoryItems = useMemo(
    () => buildCategoryItems(props.ingredients, props.manualItems, itemSearch),
    [props.ingredients, props.manualItems, itemSearch],
  )
  const hasItems = items.length > 0
  const hasChecked = items.some((item) => item.checked)

  return (
    <section>
      <div className="section-header shopping-section-header">
        <div><div className="eyebrow">SHOPPING</div><h2>{formatRange(props.weekDates)}</h2></div>
        <div className="shopping-header-controls">
          <button type="button" className="secondary shopping-organize-button" onClick={() => setShowCategoryManager(true)}>Organize categories</button>
          <div className="week-controls">
            <button onClick={() => props.setWeekOffset(props.weekOffset - 1)}>‹</button>
            <button onClick={() => props.setWeekOffset(0)}>Today</button>
            <button onClick={() => props.setWeekOffset(props.weekOffset + 1)}>›</button>
          </div>
        </div>
      </div>
      <div className="shopping-layout">
        <div className="shopping-current">
          <ShoppingAddCombobox suggestions={suggestions} value={newItem} onChange={setNewItem} onSubmit={props.onAddManual} />
          {!hasItems ? (
            <div className="empty-state"><h3>Shopping list is empty</h3><p>Add an item above, reuse a past item, or plan meals for this week.</p></div>
          ) : (
            <>
              <p className="shopping-summary">{toBuyItems.length} item{toBuyItems.length === 1 ? '' : 's'} remaining</p>
              <ShoppingList
                items={items}
                categories={props.shoppingCategories}
                hasChecked={hasChecked}
                onToggle={props.onToggle}
                onToggleManual={props.onToggleManual}
                onDeleteManual={props.onDeleteManual}
                onAddAgain={props.onAddHistory}
                onClearChecked={props.onClearChecked}
              />
            </>
          )}
        </div>
        <ShoppingHistory history={filteredHistory} totalCount={props.history.length} search={historySearch} onSearchChange={setHistorySearch} neededNames={manualNeededNames} onAdd={props.onAddHistory} onDelete={props.onDeleteHistory} />
      </div>
      {showCategoryManager && (
        <ShoppingCategoryDialog
          categories={props.shoppingCategories}
          items={categoryItems}
          search={itemSearch}
          onClose={() => setShowCategoryManager(false)}
          onSearchChange={setItemSearch}
          onSetItemCategory={props.onSetItemCategory}
          onAddCategory={props.onAddShoppingCategory}
          onMoveCategory={props.onMoveShoppingCategory}
          onDeleteCategory={props.onDeleteShoppingCategory}
        />
      )}
    </section>
  )
}
