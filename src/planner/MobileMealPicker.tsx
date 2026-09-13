import { useMemo, useState } from 'react'
import type { Ingredient, Meal, ProteinCategory } from '../types'
import { MealProteinDots } from '../meals/mealProtein'
import { ProteinFilters } from './MealBrowser'
import './MobileMealPicker.css'

export type MobilePickerSlot = { day: string; rowId: string; label: string }

export function MobileMealPicker({ slot, meals, ingredients, proteinCategories, search, proteinFilter, onSearchChange, onProteinFilterChange, onChoose, onClose }: {
  slot: MobilePickerSlot
  meals: Meal[]
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
  search: string
  proteinFilter: string | 'All'
  onSearchChange: (value: string) => void
  onProteinFilterChange: (value: string | 'All') => void
  onChoose: (meal: Meal) => void
  onClose: () => void
}) {
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null)
  const ingredientsById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  )

  return (
    <div className="mobile-meal-picker-backdrop" onClick={onClose}>
      <div className="mobile-meal-picker" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-picker-handle" />
        <div className="mobile-picker-header">
          <div><div className="eyebrow">ADD MEAL</div><h3>{slot.label}</h3></div>
          <button type="button" className="mobile-picker-close" onClick={onClose}>×</button>
        </div>
        <div className="meal-search-wrap mobile-picker-search">
          <span aria-hidden="true">⌕</span>
          <input className="meal-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search meals…" autoFocus />
        </div>
        <ProteinFilters categories={proteinCategories} value={proteinFilter} onChange={onProteinFilterChange} className="mobile-picker-filters" />
        <div className="mobile-picker-list">
          {meals.map((meal) => {
            const expanded = expandedMealId === meal.id
            const mealIngredients = meal.ingredients
              .map(({ ingredientId }) => ingredientsById.get(ingredientId))
              .filter((ingredient): ingredient is Ingredient => Boolean(ingredient))

            return (
              <div className="mobile-picker-meal-item" key={meal.id}>
                <div className="mobile-picker-meal-row">
                  <button
                    type="button"
                    className="mobile-picker-meal mobile-picker-meal-add"
                    aria-label={`Add ${meal.name}`}
                    onClick={() => onChoose(meal)}
                  >
                    <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
                    <span>{meal.name}</span><b>+</b>
                  </button>
                  <button
                    type="button"
                    className="mobile-picker-ingredients-toggle"
                    aria-label={`${expanded ? 'Hide' : 'Show'} ingredients for ${meal.name}`}
                    aria-expanded={expanded}
                    aria-controls={`mobile-picker-ingredients-${meal.id}`}
                    onClick={() => setExpandedMealId(expanded ? null : meal.id)}
                  >
                    <span aria-hidden="true">⌄</span>
                  </button>
                </div>
                {expanded && (
                  <div id={`mobile-picker-ingredients-${meal.id}`} className="mobile-picker-ingredients">
                    {mealIngredients.length > 0 ? (
                      <ul>
                        {mealIngredients.map((ingredient) => <li key={ingredient.id}>{ingredient.name}</li>)}
                      </ul>
                    ) : (
                      <span>No ingredients listed.</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
