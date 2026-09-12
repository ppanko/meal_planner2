import { useEffect, useState } from 'react'
import { mealTypes } from '../data'
import type { Ingredient, Meal, ProteinCategory } from '../types'
import { matchSearch } from '../utils/search'
import { formatQuantity } from '../utils/text'
import { MealProteinDots } from './mealProtein'

const mobileMealsQuery = '(max-width: 900px)'

function useMobileMealsLayout() {
  const getMatches = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(mobileMealsQuery).matches
  const [isMobile, setIsMobile] = useState(getMatches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia(mobileMealsQuery)
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}

export function MealsView({ meals, ingredients, onNew, onManageLibrary, onStartCooking, onEdit, onDelete, onDuplicate, proteinCategories }: {
  meals: Meal[]; ingredients: Ingredient[]; onNew: () => void; onManageLibrary: () => void; onStartCooking: (m: Meal) => void; onEdit: (m: Meal) => void; onDelete: (id: string) => void; onDuplicate: (m: Meal) => void; proteinCategories: ProteinCategory[]
}) {
  const [search, setSearch] = useState('')
  const [mobileMealType, setMobileMealType] = useState<Meal['type']>(mealTypes[0] ?? 'Breakfast')
  const isMobile = useMobileMealsLayout()
  const hasSearch = search.trim().length > 0
  const visibleMeals = meals.filter((meal) => {
    const ingredientNames = meal.ingredients
      .map((item) => ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.name ?? '')
      .filter(Boolean)
    return matchSearch([meal.name, ...ingredientNames].join(' '), search)
  })
  const mobileMeals = visibleMeals
    .filter((meal) => meal.type === mobileMealType)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section>
      <div className="section-header">
        <div><div className="eyebrow">LIBRARY</div><h2>Your Meals</h2></div>
        <div className="meal-header-actions"><button className="secondary" onClick={onManageLibrary}>Manage library</button><button className="primary" onClick={onNew}>+ New meal</button></div>
      </div>
      <div className="meal-search-wrap">
        <span aria-hidden="true">⌕</span>
        <input className="meal-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search meals or ingredients…" aria-label="Search meals" />
        {search && <button className="meal-search-clear" type="button" onClick={() => setSearch('')} aria-label="Clear meal search">×</button>}
      </div>

      {isMobile ? (
        <div>
          <div
            className="protein-filter mobile-meal-tabs"
            role="tablist"
            aria-label="Meal type"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 14 }}
          >
            {mealTypes.map((type) => {
              const selected = type === mobileMealType
              const tabId = `mobile-meals-tab-${type.toLowerCase()}`

              return (
                <button
                  key={type}
                  id={tabId}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="mobile-meals-panel"
                  tabIndex={selected ? 0 : -1}
                  className={selected ? 'active' : ''}
                  style={{ justifyContent: 'center', padding: '8px 10px' }}
                  onClick={() => setMobileMealType(type)}
                >
                  {type}
                </button>
              )
            })}
          </div>

          <div
            id="mobile-meals-panel"
            className="meal-library-full"
            role="tabpanel"
            aria-labelledby={`mobile-meals-tab-${mobileMealType.toLowerCase()}`}
          >
            <div className="meal-library-section">
              {mobileMeals.length > 0 ? (
                mobileMeals.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} onStartCooking={() => onStartCooking(meal)} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onDuplicate={() => onDuplicate(meal)} />)
              ) : (
                <div className="meal-browser-empty">
                  {hasSearch ? `No ${mobileMealType.toLowerCase()} meals match “${search.trim()}”.` : `No ${mobileMealType.toLowerCase()} meals yet.`}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : hasSearch && visibleMeals.length === 0 ? (
        <div className="meal-browser-empty">No meals match “{search.trim()}”.</div>
      ) : (
        <div className="meal-library-full">
          {mealTypes.map((type) => {
            const group = visibleMeals.filter((meal) => meal.type === type).sort((a, b) => a.name.localeCompare(b.name))
            if (hasSearch && group.length === 0) return null
            return <div key={type} className="meal-library-section"><h3>{type}</h3>{group.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} onStartCooking={() => onStartCooking(meal)} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onDuplicate={() => onDuplicate(meal)} />)}</div>
          })}
        </div>
      )}
    </section>
  )
}

function MealEditorCard({ meal, ingredients, proteinCategories, onStartCooking, onEdit, onDelete, onDuplicate }: { meal: Meal; ingredients: Ingredient[]; proteinCategories: ProteinCategory[]; onStartCooking: () => void; onEdit: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const sortedMealIngredients = [...meal.ingredients].sort((a, b) => {
    const aName = ingredients.find((ingredient) => ingredient.id === a.ingredientId)?.name ?? ''
    const bName = ingredients.find((ingredient) => ingredient.id === b.ingredientId)?.name ?? ''
    return aName.localeCompare(bName)
  })

  return (
    <article className="meal-detail-card">
      <div className="meal-detail-top">
        <h3><MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />{meal.name}</h3>
        <span className="pill">{meal.type}</span>
      </div>
      <ul>{sortedMealIngredients.map((mi, index) => { const ing = ingredients.find((i) => i.id === mi.ingredientId); return ing ? <li key={`${mi.ingredientId}-${index}`}>{formatQuantity(mi.quantity)} {ing.unit} {ing.name}</li> : null })}</ul>
      {Boolean(meal.recipeUrl || meal.notes || meal.instructions?.length) && <div className="recipe-summary"><span>{meal.instructions?.length ?? 0} {(meal.instructions?.length ?? 0) === 1 ? 'step' : 'steps'}</span>{meal.recipeUrl && <span>Recipe link</span>}{meal.notes && <span>Notes</span>}</div>}
      <div className="card-actions"><button className="start-cooking-button" onClick={onStartCooking}>Start cooking</button><button onClick={onEdit}>Edit</button><button onClick={onDuplicate}>Duplicate</button><button className="danger-text" onClick={onDelete}>Delete</button></div>
    </article>
  )
}
