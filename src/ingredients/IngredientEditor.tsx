import { useId, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { Ingredient, ProteinCategory, ShoppingCategory } from '../types'
import { buildIngredient, findIngredientByName } from './catalog'
import './IngredientEditor.css'

type IngredientEditorProps = {
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
  shoppingCategories: ShoppingCategory[]
  initialName?: string
  onSave: (ingredient: Ingredient) => void
  onCancel: () => void
}

export function IngredientEditor({
  ingredients,
  proteinCategories,
  shoppingCategories,
  initialName = '',
  onSave,
  onCancel,
}: IngredientEditorProps) {
  const titleId = useId()
  const [name, setName] = useState(initialName)
  const [unit, setUnit] = useState('each')
  const [proteinCategoryId, setProteinCategoryId] = useState('')
  const [shoppingCategoryId, setShoppingCategoryId] = useState('')
  const [error, setError] = useState('')
  const proteins = proteinCategories
    .filter((category) => category.id !== 'none')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  function save(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Add a name for this ingredient.')
      return
    }
    if (findIngredientByName(ingredients, trimmedName)) {
      setError('That ingredient already exists.')
      return
    }

    onSave(buildIngredient(ingredients, {
      name: trimmedName,
      unit,
      proteinCategoryId: proteinCategoryId || null,
      shoppingCategoryId: shoppingCategoryId || null,
    }))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <div className="modal-backdrop" onClick={onCancel} onKeyDown={handleKeyDown}>
      <form
        className="modal ingredient-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div><div className="eyebrow">INGREDIENT</div><h2 id={titleId}>New ingredient</h2></div>
          <button type="button" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="ingredient-editor-fields">
          <label className="ingredient-editor-name">
            Name
            <input
              value={name}
              onChange={(event) => { setName(event.target.value); setError('') }}
              placeholder="e.g. Greek yogurt"
              autoFocus
            />
          </label>
          <label>
            Unit
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="each" />
          </label>
          <label>
            Protein
            <select value={proteinCategoryId} onChange={(event) => setProteinCategoryId(event.target.value)}>
              <option value="">No protein</option>
              {proteins.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            Shopping category
            <select value={shoppingCategoryId} onChange={(event) => setShoppingCategoryId(event.target.value)}>
              <option value="">Uncategorized</option>
              {shoppingCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Save ingredient</button>
        </div>
      </form>
    </div>
  )
}
