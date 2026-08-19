import { useState } from 'react'
import { mealTypes } from '../data'
import type { Ingredient, Meal, MealType, ProteinCategory } from '../types'
import { ProteinDot } from './mealProtein'
import { normalizeRecipeUrl } from './recipeDetails'
import { useEscapeKey } from './useEscapeKey'

type MealFormProps = {
  meal: Meal | null | undefined
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
  duplicateMode?: boolean
  onCancel: () => void
  onSave: (meal: Meal, oldId?: string) => void
}

export function MealForm({ meal, ingredients, proteinCategories, duplicateMode = false, onCancel, onSave }: MealFormProps) {
  useEscapeKey(onCancel)
  const [name, setName] = useState(meal?.name ?? '')
  const [type, setType] = useState<MealType>(meal?.type ?? 'Dinner')
  const [proteinCategoryOverrideId, setProteinCategoryOverrideId] = useState(meal?.proteinCategoryOverrideId ?? '')
  const [rows, setRows] = useState(meal?.ingredients.map((item) => ({ ...item })) ?? [])
  const [recipeUrl, setRecipeUrl] = useState(meal?.recipeUrl ?? '')
  const [notes, setNotes] = useState(meal?.notes ?? '')
  const [instructions, setInstructions] = useState([...(meal?.instructions ?? [])])
  const [error, setError] = useState('')

  function addRow() {
    const first = ingredients[0]
    if (first) setRows([...rows, { ingredientId: first.id, quantity: 1 }])
  }

  function save() {
    if (!name.trim()) {
      setError('Add a name for this meal.')
      return
    }
    if (rows.length === 0) {
      setError('Add at least one ingredient.')
      return
    }

    const normalizedUrl = normalizeRecipeUrl(recipeUrl)
    if (normalizedUrl === null) {
      setError('Enter a valid http or https recipe URL.')
      return
    }

    onSave({
      id: meal?.id ?? crypto.randomUUID(),
      name: name.trim(),
      type,
      proteinCategoryOverrideId: proteinCategoryOverrideId || null,
      ingredients: rows,
      recipeUrl: normalizedUrl,
      notes: notes.trim(),
      instructions: instructions.map((step) => step.trim()).filter(Boolean),
    }, duplicateMode ? undefined : meal?.id)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal meal-form-modal" role="dialog" aria-modal="true" aria-labelledby="meal-form-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><div className="eyebrow">MEAL DETAILS</div><h2 id="meal-form-title">{duplicateMode ? 'Duplicate meal' : meal ? 'Edit meal' : 'New meal'}</h2></div>
          <button type="button" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <section className="meal-form-section">
          <h3>Basics</h3>
          <div className="meal-form-basics">
            <label>Name<input value={name} onChange={(event) => { setName(event.target.value); setError('') }} placeholder="e.g. Chicken tacos" autoFocus /></label>
            <label>Type<select value={type} onChange={(event) => setType(event.target.value as MealType)}>{mealTypes.map((mealType) => <option key={mealType}>{mealType}</option>)}</select></label>
          </div>
          <label>Protein<select value={proteinCategoryOverrideId} onChange={(event) => setProteinCategoryOverrideId(event.target.value)}><option value="">Auto from ingredients</option>{proteinCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <div className="protein-guide">{proteinCategories.map((category) => <span key={category.id}><ProteinDot category={category} />{category.name}</span>)}</div>
        </section>

        <section className="meal-form-section">
          <div className="meal-form-section-heading">
            <div><h3>Ingredients</h3><p>Choose from your reusable ingredient library.</p></div>
            <span>Manage the library from the Meals tab</span>
          </div>
          <div className="ingredients-editor">
            {rows.map((row, index) => {
              const ingredient = ingredients.find((item) => item.id === row.ingredientId)
              const category = proteinCategories.find((item) => item.id === ingredient?.proteinCategoryId)
              return <div className="ingredient-row" key={`${row.ingredientId}-${index}`}>
                <select aria-label={`Ingredient ${index + 1}`} value={row.ingredientId} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, ingredientId: event.target.value } : item))}>{ingredients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
                <input aria-label={`Quantity ${index + 1}`} type="number" min="0" step="0.25" value={row.quantity} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} />
                <span>{ingredient?.unit ?? ''}</span>
                <span className="ingredient-protein-indicator">{category ? <><ProteinDot category={category} />{category.name}</> : '—'}</span>
                <button type="button" className="ingredient-row-remove" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ingredient ${index + 1}`} title="Remove ingredient">×</button>
              </div>
            })}
            {ingredients.length > 0 ? <button type="button" className="secondary" onClick={() => { addRow(); setError('') }}>+ Add ingredient</button> : <p className="form-empty-note">Your ingredient library is empty. Close this form and add an ingredient from Manage library.</p>}
          </div>
        </section>

        <section className="meal-form-section recipe-editor">
          <div className="meal-form-section-heading"><div><h3>Recipe</h3><p>Optional details for when it is time to cook.</p></div></div>
          <label>Recipe URL<input type="url" inputMode="url" value={recipeUrl} onChange={(event) => { setRecipeUrl(event.target.value); setError('') }} placeholder="https://example.com/recipe" /></label>
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Substitutions, timing notes, or family preferences" rows={3} /></label>
          <div className="instructions-editor">
            <div className="editor-label">Cooking steps</div>
            {instructions.map((step, index) => <div className="instruction-editor-row" key={index}>
              <span>{index + 1}</span>
              <textarea aria-label={`Cooking step ${index + 1}`} value={step} onChange={(event) => setInstructions(instructions.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Describe this step" rows={2} />
              <button type="button" onClick={() => setInstructions(instructions.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove cooking step ${index + 1}`}>×</button>
            </div>)}
            <button type="button" className="secondary" onClick={() => setInstructions([...instructions, ''])}>+ Add step</button>
          </div>
        </section>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={save}>Save meal</button></div>
      </div>
    </div>
  )
}
