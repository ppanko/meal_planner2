import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ShoppingCategory } from '../types'
import { defaultShoppingCategoryIds } from './shoppingUtils'
import type { CategoryItem } from './shoppingViewModel'

export function ShoppingCategoryDialog({ categories, items, search, onClose, onSearchChange, onSetItemCategory, onAddCategory, onMoveCategory, onDeleteCategory }: {
  categories: ShoppingCategory[]
  items: CategoryItem[]
  search: string
  onClose: () => void
  onSearchChange: (value: string) => void
  onSetItemCategory: (ingredientId: string | null, manualIds: string[], categoryId: string | null) => void
  onAddCategory: (name: string) => void
  onMoveCategory: (categoryId: string, direction: -1 | 1) => void
  onDeleteCategory: (categoryId: string) => void
}) {
  const [newCategoryName, setNewCategoryName] = useState('')

  function submitCategory(event: FormEvent) {
    event.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    onAddCategory(trimmed)
    setNewCategoryName('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shopping-category-modal" role="dialog" aria-modal="true" aria-labelledby="shopping-category-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><div className="eyebrow">SHOPPING ORGANIZATION</div><h2 id="shopping-category-title">Organize categories</h2></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <section className="shopping-category-manager-section">
          <div className="shopping-category-manager-heading"><div><h3>Store order</h3><p>Move categories into the order you usually walk through the store.</p></div></div>
          <div className="shopping-category-order-list">
            {categories.map((category, index) => (
              <div className="shopping-category-order-row" key={category.id}>
                <span>{category.name}</span>
                <div className="shopping-category-order-actions">
                  <button type="button" onClick={() => onMoveCategory(category.id, -1)} disabled={index === 0} aria-label={`Move ${category.name} up`} title="Move up">↑</button>
                  <button type="button" onClick={() => onMoveCategory(category.id, 1)} disabled={index === categories.length - 1} aria-label={`Move ${category.name} down`} title="Move down">↓</button>
                  {!defaultShoppingCategoryIds.has(category.id) && <button type="button" className="shopping-category-delete" onClick={() => onDeleteCategory(category.id)} aria-label={`Delete ${category.name} shopping category`}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
          <form className="shopping-category-add" onSubmit={submitCategory}>
            <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Custom category, e.g. Bakery" aria-label="New shopping category" />
            <button type="submit" className="secondary">Add category</button>
          </form>
        </section>
        <section className="shopping-category-manager-section item-category-section">
          <div className="shopping-category-manager-heading"><div><h3>Item categories</h3><p>Set where each item belongs. Its category will be reused automatically.</p></div></div>
          <input className="shopping-category-ingredient-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search items…" aria-label="Search items to categorize" />
          <div className="shopping-category-ingredient-list">
            {items.length > 0 ? items.map((item) => (
              <label className="shopping-category-ingredient-row" key={item.key}>
                <span>{item.name}</span>
                <select value={item.categoryId ?? ''} onChange={(event) => onSetItemCategory(item.ingredientId, item.manualIds, event.target.value || null)} aria-label={`Shopping category for ${item.name}`}>
                  <option value="">Uncategorized</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            )) : <div className="ingredient-manager-empty">No items match your search.</div>}
          </div>
        </section>
        <div className="modal-actions"><button type="button" className="primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  )
}
