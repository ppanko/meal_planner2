import type { Ingredient, Meal } from '../types'
import { formatQuantity } from '../utils/text'
import './PlannerMealDetails.css'

export function PlannerMealDetails({ meal, ingredients, onClose }: {
  meal: Meal
  ingredients: Ingredient[]
  onClose: () => void
}) {
  const ingredientDetails = meal.ingredients.flatMap((item) => {
    const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)
    return ingredient ? [{ ingredient, quantity: item.quantity }] : []
  })

  return (
    <div className="modal-backdrop planner-meal-details-backdrop" onClick={onClose}>
      <div
        className="modal planner-meal-details"
        role="dialog"
        aria-modal="true"
        aria-label={`${meal.name} meal details`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="planner-meal-details-header">
          <div>
            <div className="eyebrow">MEAL DETAILS</div>
            <h2>{meal.name}</h2>
          </div>
          <button type="button" className="planner-meal-details-close" onClick={onClose} aria-label="Close meal details">×</button>
        </div>
        <h3>Ingredients</h3>
        {ingredientDetails.length > 0 ? (
          <ul>
            {ingredientDetails.map(({ ingredient, quantity }, index) => (
              <li key={`${ingredient.id}-${index}`}>{formatQuantity(quantity)} {ingredient.unit} {ingredient.name}</li>
            ))}
          </ul>
        ) : (
          <p className="planner-meal-details-empty">No ingredients listed.</p>
        )}
      </div>
    </div>
  )
}
