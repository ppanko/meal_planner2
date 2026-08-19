import { useState } from 'react'
import type { Ingredient, Meal } from '../types'
import { formatQuantity } from '../utils/text'
import { normalizeRecipeUrl } from './recipeDetails'
import { useEscapeKey } from './useEscapeKey'

type CookingViewProps = {
  meal: Meal
  ingredients: Ingredient[]
  onClose: () => void
}

export function CookingView({ meal, ingredients, onClose }: CookingViewProps) {
  useEscapeKey(onClose)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set())
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set())
  const recipeUrl = normalizeRecipeUrl(meal.recipeUrl ?? '')
  const steps = (meal.instructions ?? []).filter((step) => step.trim())

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<number>>>, current: Set<number>, index: number) {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setter(next)
  }

  return <div className="modal-backdrop cooking-backdrop" onClick={onClose}>
    <div className="modal cooking-view" role="dialog" aria-modal="true" aria-labelledby="cooking-view-title" onClick={(event) => event.stopPropagation()}>
      <div className="cooking-header">
        <div><div className="eyebrow">NOW COOKING</div><h2 id="cooking-view-title">{meal.name}</h2><span className="pill">{meal.type}</span></div>
        <button type="button" onClick={onClose} aria-label="Close cooking view">×</button>
      </div>

      {recipeUrl && <a className="recipe-source-link" href={recipeUrl} target="_blank" rel="noreferrer">Open original recipe ↗</a>}

      <section className="cooking-section">
        <h3>Ingredients</h3>
        <div className="cooking-checklist">
          {meal.ingredients.map((item, index) => {
            const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)
            if (!ingredient) return null
            const checked = checkedIngredients.has(index)
            return <label className={checked ? 'checked' : ''} key={`${item.ingredientId}-${index}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(setCheckedIngredients, checkedIngredients, index)} />
              <span className="cooking-checkmark" />
              <span><strong>{formatQuantity(item.quantity)} {ingredient.unit}</strong> {ingredient.name}</span>
            </label>
          })}
        </div>
      </section>

      <section className="cooking-section">
        <h3>Steps</h3>
        {steps.length > 0 ? <ol className="cooking-steps">
          {steps.map((step, index) => {
            const checked = checkedSteps.has(index)
            return <li className={checked ? 'checked' : ''} key={index}>
              <label>
                <input type="checkbox" checked={checked} onChange={() => toggle(setCheckedSteps, checkedSteps, index)} />
                <span className="step-number">{index + 1}</span>
                <span>{step}</span>
              </label>
            </li>
          })}
        </ol> : <p className="cooking-empty">No cooking steps have been added yet. You can still use the ingredient checklist and notes.</p>}
      </section>

      {(meal.notes ?? '').trim() && <section className="cooking-section cooking-notes"><h3>Notes</h3><p>{meal.notes}</p></section>}
      <div className="cooking-footer"><button type="button" className="primary" onClick={onClose}>Finish cooking</button></div>
    </div>
  </div>
}
