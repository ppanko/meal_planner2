import type { Ingredient, Meal, ProteinCategory } from '../types'
import { ProteinDot } from '../meals/mealProtein'
import { DraggableMeal } from './PlannerSlots'

export function ProteinFilters({ categories, value, onChange, className = '' }: {
  categories: ProteinCategory[]
  value: string | 'All'
  onChange: (value: string | 'All') => void
  className?: string
}) {
  return (
    <div className={`protein-filter ${className}`.trim()} aria-label="Filter meals by protein">
      <button type="button" className={value === 'All' ? 'active' : ''} onClick={() => onChange('All')}>All</button>
      {categories.map((category) => (
        <button key={category.id} type="button" className={value === category.id ? 'active' : ''} onClick={() => onChange(category.id)}>
          <ProteinDot category={category} />{category.name}
        </button>
      ))}
    </div>
  )
}

export function MealBrowser({ open, meals, ingredients, proteinCategories, search, proteinFilter, onSearchChange, onProteinFilterChange, onAddMeal }: {
  open: boolean
  meals: Meal[]
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
  search: string
  proteinFilter: string | 'All'
  onSearchChange: (value: string) => void
  onProteinFilterChange: (value: string | 'All') => void
  onAddMeal: (meal: Meal) => void
}) {
  return (
    <aside className={`meal-library ${open ? 'mobile-open' : ''}`}>
      <div className="meal-browser-header">
        <h3>Meals</h3>
        <p className="hint">Drag a meal to a slot, or tap it to add it to the next empty slot.</p>
        <div className="meal-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input className="meal-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search meals…" aria-label="Search meals" />
          {search && <button className="meal-search-clear" type="button" onClick={() => onSearchChange('')} aria-label="Clear meal search">×</button>}
        </div>
        <ProteinFilters categories={proteinCategories} value={proteinFilter} onChange={onProteinFilterChange} />
      </div>
      <div className="meal-browser-list">
        {meals.length > 0 ? meals.map((meal) => (
          <DraggableMeal key={meal.id} meal={meal} onTap={() => onAddMeal(meal)} ingredients={ingredients} proteinCategories={proteinCategories} />
        )) : <div className="meal-browser-empty">No meals match “{search}”.</div>}
      </div>
    </aside>
  )
}
