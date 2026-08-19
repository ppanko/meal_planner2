import type { Ingredient, Meal, ProteinCategory } from '../types'
import { MealProteinDots } from '../meals/mealProtein'
import { ProteinFilters } from './MealBrowser'

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
          {meals.map((meal) => (
            <button type="button" className="mobile-picker-meal" key={meal.id} onClick={() => onChoose(meal)}>
              <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
              <span>{meal.name}</span><b>+</b>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
