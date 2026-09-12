import { useEffect, useState } from 'react'
import { mealTypes } from '../data'
import type { Ingredient, Meal, ProteinCategory } from '../types'
import { matchSearch } from '../utils/search'
import { formatQuantity } from '../utils/text'
import { getMealProteinCategories, MealProteinDots } from './mealProtein'

const mobileMealsQuery = '(max-width: 900px)'

type ProteinFilterValue = string | 'All'

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

function mealMatchesProtein(
  meal: Meal,
  ingredients: Ingredient[],
  proteinCategories: ProteinCategory[],
  proteinFilter: ProteinFilterValue,
) {
  if (proteinFilter === 'All') return true

  const categories = getMealProteinCategories(meal, ingredients, proteinCategories)
  if (proteinFilter === 'none') {
    return categories.length === 0 || categories.some((category) => category.id === 'none')
  }

  return categories.some((category) => category.id === proteinFilter)
}

function ProteinFilterControls({
  proteinCategories,
  value,
  onChange,
  scrollable = false,
}: {
  proteinCategories: ProteinCategory[]
  value: ProteinFilterValue
  onChange: (value: ProteinFilterValue) => void
  scrollable?: boolean
}) {
  const options = [{ id: 'All', name: 'All', color: null }, ...proteinCategories]

  return (
    <div
      className="protein-filter"
      aria-label="Filter meals by protein"
      style={scrollable ? {
        flexWrap: 'nowrap',
        overflowX: 'auto',
        margin: 0,
        paddingBottom: 4,
        WebkitOverflowScrolling: 'touch',
      } : { margin: 0 }}
    >
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            className={selected ? 'active' : ''}
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            style={{
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              ...(scrollable ? { minHeight: 36, padding: '7px 10px' } : {}),
            }}
          >
            {option.color && (
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: option.color,
                  flex: '0 0 auto',
                }}
              />
            )}
            {option.name}
          </button>
        )
      })}
    </div>
  )
}

export function MealsView({ meals, ingredients, onNew, onManageLibrary, onStartCooking, onEdit, onDelete, onDuplicate, proteinCategories }: {
  meals: Meal[]; ingredients: Ingredient[]; onNew: () => void; onManageLibrary: () => void; onStartCooking: (m: Meal) => void; onEdit: (m: Meal) => void; onDelete: (id: string) => void; onDuplicate: (m: Meal) => void; proteinCategories: ProteinCategory[]
}) {
  const [search, setSearch] = useState('')
  const [proteinFilter, setProteinFilter] = useState<ProteinFilterValue>('All')
  const [mobileMealType, setMobileMealType] = useState<Meal['type']>(mealTypes[0] ?? 'Breakfast')
  const isMobile = useMobileMealsLayout()
  const hasSearch = search.trim().length > 0
  const hasActiveFilters = hasSearch || proteinFilter !== 'All'
  const visibleMeals = meals.filter((meal) => {
    const ingredientNames = meal.ingredients
      .map((item) => ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.name ?? '')
      .filter(Boolean)
    return matchSearch([meal.name, ...ingredientNames].join(' '), search)
      && mealMatchesProtein(meal, ingredients, proteinCategories, proteinFilter)
  })
  const mobileMeals = visibleMeals
    .filter((meal) => meal.type === mobileMealType)
    .sort((a, b) => a.name.localeCompare(b.name))

  const searchControl = (
    <div className="meal-search-wrap" style={isMobile ? { margin: '8px 0 10px' } : { margin: 0 }}>
      <span aria-hidden="true">⌕</span>
      <input className="meal-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search meals or ingredients…" aria-label="Search meals" />
      {search && <button className="meal-search-clear" type="button" onClick={() => setSearch('')} aria-label="Clear meal search">×</button>}
    </div>
  )

  return (
    <section>
      <div
        className="section-header"
        style={isMobile ? { alignItems: 'center', gap: 10, marginBottom: 8 } : undefined}
      >
        <div>{!isMobile && <div className="eyebrow">LIBRARY</div>}<h2>Your Meals</h2></div>
        <div className="meal-header-actions" style={isMobile ? { flexDirection: 'row', gap: 6 } : undefined}>
          <button
            className="secondary"
            onClick={onManageLibrary}
            aria-label="Manage library"
            style={isMobile ? { padding: '7px 9px', fontSize: 11, background: 'transparent' } : undefined}
          >
            {isMobile ? 'Manage' : 'Manage library'}
          </button>
          <button
            className="primary"
            onClick={onNew}
            aria-label="+ New meal"
            style={isMobile ? { padding: '8px 10px', fontSize: 11 } : undefined}
          >
            {isMobile ? '+ New' : '+ New meal'}
          </button>
        </div>
      </div>

      {isMobile ? (
        <>
          {searchControl}

          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 6,
              margin: '0 -14px 12px',
              padding: '4px 14px 8px',
              background: 'var(--bg)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div
              role="tablist"
              aria-label="Meal type"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}
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
                    style={{
                      minHeight: 38,
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      background: selected ? 'var(--accent-soft)' : 'var(--panel)',
                      color: selected ? 'var(--accent)' : 'var(--muted)',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                    onClick={() => setMobileMealType(type)}
                  >
                    {type}
                  </button>
                )
              })}
            </div>

            <ProteinFilterControls
              proteinCategories={proteinCategories}
              value={proteinFilter}
              onChange={setProteinFilter}
              scrollable
            />
          </div>

          <div
            id="mobile-meals-panel"
            className="meal-library-full"
            role="tabpanel"
            aria-labelledby={`mobile-meals-tab-${mobileMealType.toLowerCase()}`}
          >
            <div className="meal-library-section">
              {mobileMeals.length > 0 ? (
                mobileMeals.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} showTypePill={false} onStartCooking={() => onStartCooking(meal)} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onDuplicate={() => onDuplicate(meal)} />)
              ) : (
                <div className="meal-browser-empty">
                  {hasActiveFilters ? `No ${mobileMealType.toLowerCase()} meals match the current filters.` : `No ${mobileMealType.toLowerCase()} meals yet.`}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 1fr) auto',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            {searchControl}
            <ProteinFilterControls
              proteinCategories={proteinCategories}
              value={proteinFilter}
              onChange={setProteinFilter}
            />
          </div>

          {hasActiveFilters && visibleMeals.length === 0 ? (
            <div className="meal-browser-empty">
              {hasSearch && proteinFilter === 'All'
                ? `No meals match “${search.trim()}”.`
                : 'No meals match the current filters.'}
            </div>
          ) : (
            <div className="meal-library-full">
              {mealTypes.map((type) => {
                const group = visibleMeals.filter((meal) => meal.type === type).sort((a, b) => a.name.localeCompare(b.name))
                if (hasActiveFilters && group.length === 0) return null
                return <div key={type} className="meal-library-section"><h3>{type}</h3>{group.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} onStartCooking={() => onStartCooking(meal)} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onDuplicate={() => onDuplicate(meal)} />)}</div>
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function MealEditorCard({ meal, ingredients, proteinCategories, showTypePill = true, onStartCooking, onEdit, onDelete, onDuplicate }: { meal: Meal; ingredients: Ingredient[]; proteinCategories: ProteinCategory[]; showTypePill?: boolean; onStartCooking: () => void; onEdit: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const sortedMealIngredients = [...meal.ingredients].sort((a, b) => {
    const aName = ingredients.find((ingredient) => ingredient.id === a.ingredientId)?.name ?? ''
    const bName = ingredients.find((ingredient) => ingredient.id === b.ingredientId)?.name ?? ''
    return aName.localeCompare(bName)
  })

  return (
    <article className="meal-detail-card">
      <div className="meal-detail-top">
        <h3><MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />{meal.name}</h3>
        {showTypePill && <span className="pill">{meal.type}</span>}
      </div>
      <ul>{sortedMealIngredients.map((mi, index) => { const ing = ingredients.find((i) => i.id === mi.ingredientId); return ing ? <li key={`${mi.ingredientId}-${index}`}>{formatQuantity(mi.quantity)} {ing.unit} {ing.name}</li> : null })}</ul>
      {Boolean(meal.recipeUrl || meal.notes || meal.instructions?.length) && <div className="recipe-summary"><span>{meal.instructions?.length ?? 0} {(meal.instructions?.length ?? 0) === 1 ? 'step' : 'steps'}</span>{meal.recipeUrl && <span>Recipe link</span>}{meal.notes && <span>Notes</span>}</div>}
      <div className="card-actions"><button className="start-cooking-button" onClick={onStartCooking}>Start cooking</button><button onClick={onEdit}>Edit</button><button onClick={onDuplicate}>Duplicate</button><button className="danger-text" onClick={onDelete}>Delete</button></div>
    </article>
  )
}
