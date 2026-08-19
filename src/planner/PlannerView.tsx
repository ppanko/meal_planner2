import { useMemo, useState } from 'react'
import type { AppState, Meal, ProteinCategory } from '../types'
import { MealProteinDots, ProteinDot, getMealProteinCategories } from '../meals/mealProtein'
import { dateKey, formatRange } from '../utils/dates'
import { dayShort, defaultPlannerRows, getPlannerRows, getSlotMealIds } from './plannerUtils'
import { DraggableMeal, MobilePlannerSlot, PlannerSlot } from './PlannerSlots'

export function PlannerView({
  state,
  weekDates,
  weekOffset,
  setWeekOffset,
  addMeal,
  addMealToSlot,
  removeMeal,
  updatePlannerNote,
  addPlannerRow,
  removePlannerRow,
  onCopyWeek,
  proteinCategories,
}: {
  state: AppState
  weekDates: Date[]
  weekOffset: number
  setWeekOffset: (n: number) => void
  addMeal: (meal: Meal) => void
  addMealToSlot: (day: string, rowId: string, meal: Meal) => void
  removeMeal: (day: string, rowId: string, mealId: string) => void
  updatePlannerNote: (day: string, rowId: string, note: string) => void
  addPlannerRow: (label: string) => void
  removePlannerRow: (rowId: string) => void
  onCopyWeek: () => void
  proteinCategories: ProteinCategory[]
}) {
  const [mealSearch, setMealSearch] = useState('')
  const [proteinFilter, setProteinFilter] = useState<string | 'All'>('All')
  const [showMealBrowser, setShowMealBrowser] = useState(false)
  const [newRowLabel, setNewRowLabel] = useState('')
  const [showRowEditor, setShowRowEditor] = useState(false)
  const [mobilePickerSlot, setMobilePickerSlot] = useState<{ day: string; rowId: string; label: string } | null>(null)
  const customRows = state.plannerRowsByWeek[dateKey(weekDates[0])] ?? []

  const filteredMeals = useMemo(() => {
    const query = mealSearch.trim().toLowerCase()

    return [...state.meals]
      .filter((meal) => !query || meal.name.toLowerCase().includes(query))
      .filter((meal) => {
        if (proteinFilter === 'All') return true
        const categories = getMealProteinCategories(meal, state.ingredients, proteinCategories)
        if (categories.length === 0) return proteinFilter === 'none'
        return categories.some((category) => category.id === proteinFilter)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [state.meals, state.ingredients, proteinCategories, mealSearch, proteinFilter])

  return (
    <section className="planner-page">
      <div className="section-header">
        <div>
          <div className="eyebrow">WEEKLY PLAN</div>
          <h2>{formatRange(weekDates)}</h2>
        </div>
        <div className="planner-header-controls">
          <button type="button" className="secondary copy-week-trigger" onClick={onCopyWeek}>Copy week</button>
          <div className="week-controls">
            <button onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
            <button onClick={() => setWeekOffset(0)}>Today</button>
            <button onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
          </div>
        </div>
      </div>

      <button
        className="mobile-meal-browser-toggle legacy-mobile-browser-toggle"
        type="button"
        onClick={() => setShowMealBrowser((open) => !open)}
      >
        {showMealBrowser ? 'Hide meals' : 'Browse meals'}
        <span>{filteredMeals.length}</span>
      </button>

      <div className="planner-layout desktop-planner-layout">
        <aside className={`meal-library ${showMealBrowser ? 'mobile-open' : ''}`}>
          <div className="meal-browser-header">
            <h3>Meals</h3>
            <p className="hint">Drag a meal to a slot, or tap it to add it to the next empty slot.</p>

            <div className="meal-search-wrap">
              <span aria-hidden="true">⌕</span>
              <input
                className="meal-search"
                type="search"
                value={mealSearch}
                onChange={(event) => setMealSearch(event.target.value)}
                placeholder="Search meals…"
                aria-label="Search meals"
              />
              {mealSearch && (
                <button
                  className="meal-search-clear"
                  type="button"
                  onClick={() => setMealSearch('')}
                  aria-label="Clear meal search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="protein-filter" aria-label="Filter meals by protein">
              <button
                type="button"
                className={proteinFilter === 'All' ? 'active' : ''}
                onClick={() => setProteinFilter('All')}
              >
                All
              </button>
              {proteinCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={proteinFilter === category.id ? 'active' : ''}
                  onClick={() => setProteinFilter(category.id)}
                >
                  <ProteinDot category={category} />
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="meal-browser-list">
            {filteredMeals.length > 0 ? (
              filteredMeals.map((meal) => (
                <DraggableMeal
                  key={meal.id}
                  meal={meal}
                  onTap={() => addMeal(meal)}
                  ingredients={state.ingredients}
                  proteinCategories={proteinCategories}
                />
              ))
            ) : (
              <div className="meal-browser-empty">No meals match “{mealSearch}”.</div>
            )}
          </div>
        </aside>

        <div className="planner-scroll">
          <div className="planner-grid">
            <div className="corner" />
            {weekDates.map((date, i) => (
              <div className="day-header" key={date.toISOString()}>
                <b>{dayShort[i]}</b>
                <span>{date.getDate()}</span>
              </div>
            ))}

            {getPlannerRows(state, weekDates).map((row, rowIndex) => {
              const isCustom = row.id.startsWith('custom-')
              const firstCustomIndex = defaultPlannerRows.length

              return (
                <div
                  className={`planner-row ${isCustom && rowIndex === firstCustomIndex ? 'first-custom-row' : ''}`}
                  key={row.id}
                >
                  <div className="meal-type-label planner-row-label">
                    <span>{row.label}</span>
                    {isCustom && (
                      <button
                        type="button"
                        className="remove-planner-row"
                        onClick={() => removePlannerRow(row.id)}
                        aria-label={`Remove ${row.label} row`}
                        title="Remove row"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {weekDates.map((date) => {
                    const key = dateKey(date)
                    const mealIds = getSlotMealIds(state.planner, key, row.id)
                    const meals = mealIds
                      .map((mealId) => state.meals.find((meal) => meal.id === mealId))
                      .filter((meal): meal is Meal => Boolean(meal))

                    return (
                      <PlannerSlot
                        key={`${key}-${row.id}`}
                        day={key}
                        rowId={row.id}
                        meals={meals}
                        note={state.plannerNotes[key]?.[row.id] ?? ''}
                        onNoteChange={(note) => updatePlannerNote(key, row.id, note)}
                        onRemoveMeal={(mealId) => removeMeal(key, row.id, mealId)}
                        ingredients={state.ingredients}
                        proteinCategories={proteinCategories}
                      />
                    )
                  })}
                </div>
              )
            })}

            <div className={`planner-add-row ${showRowEditor ? 'editing' : ''}`}>
              {!showRowEditor ? (
                <button
                  type="button"
                  className="add-row-trigger"
                  onClick={() => setShowRowEditor(true)}
                >
                  <span className="add-row-icon">+</span>
                  <span>
                    <strong>Add custom row</strong>
                    <small>For guests, kids, dietary needs, or another meal</small>
                  </span>
                </button>
              ) : (
                <div className="add-row-editor">
                  <div className="add-row-editor-copy">
                    <strong>New planner row</strong>
                    <small>Name is optional</small>
                  </div>

                  <input
                    value={newRowLabel}
                    onChange={(event) => setNewRowLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        addPlannerRow(newRowLabel)
                        setNewRowLabel('')
                        setShowRowEditor(false)
                      }

                      if (event.key === 'Escape') {
                        setNewRowLabel('')
                        setShowRowEditor(false)
                      }
                    }}
                    placeholder="e.g. Guests"
                    aria-label="Optional new planner row name"
                    autoFocus
                  />

                  <div className="add-row-editor-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setNewRowLabel('')
                        setShowRowEditor(false)
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        addPlannerRow(newRowLabel)
                        setNewRowLabel('')
                        setShowRowEditor(false)
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mobile-planner">
        <div className="mobile-planner-days">
          {weekDates.map((date, dayIndex) => {
            const dayKeyValue = dateKey(date)
            return (
              <section className="mobile-day-card" key={dayKeyValue}>
                <div className="mobile-day-header">
                  <span>{dayShort[dayIndex]}</span>
                  <strong>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                </div>

                {getPlannerRows(state, weekDates).map((row, rowIndex) => {
                  const mealIds = getSlotMealIds(state.planner, dayKeyValue, row.id)
                  const meals = mealIds
                    .map((mealId) => state.meals.find((meal) => meal.id === mealId))
                    .filter((meal): meal is Meal => Boolean(meal))
                  const isCustom = row.id.startsWith('custom-')

                  return (
                    <MobilePlannerSlot
                      key={`${dayKeyValue}-${row.id}`}
                      label={row.label}
                      firstCustom={isCustom && rowIndex === defaultPlannerRows.length}
                      meals={meals}
                      note={state.plannerNotes[dayKeyValue]?.[row.id] ?? ''}
                      ingredients={state.ingredients}
                      proteinCategories={proteinCategories}
                      onAdd={() => {
                        if (meals.length < 3) {
                          setMobilePickerSlot({
                            day: dayKeyValue,
                            rowId: row.id,
                            label: `${dayShort[dayIndex]} · ${row.label}`,
                          })
                        }
                      }}
                      onRemoveMeal={(mealId) => removeMeal(dayKeyValue, row.id, mealId)}
                      onNoteChange={(note) => updatePlannerNote(dayKeyValue, row.id, note)}
                    />
                  )
                })}
              </section>
            )
          })}
        </div>

        <div className={`mobile-custom-row-manager ${showRowEditor ? 'editing' : ''}`}>
          {!showRowEditor ? (
            <button
              type="button"
              className="mobile-custom-row-trigger"
              onClick={() => setShowRowEditor(true)}
            >
              <span className="add-row-icon">+</span>
              <span>
                <strong>Add custom row</strong>
                <small>For guests, kids, dietary needs, or another meal</small>
              </span>
            </button>
          ) : (
            <div className="mobile-custom-row-editor">
              <input
                value={newRowLabel}
                onChange={(event) => setNewRowLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    addPlannerRow(newRowLabel)
                    setNewRowLabel('')
                    setShowRowEditor(false)
                  }

                  if (event.key === 'Escape') {
                    setNewRowLabel('')
                    setShowRowEditor(false)
                  }
                }}
                placeholder="e.g. Kids, Vegetarian, Extra meal"
                aria-label="Optional new planner row name"
                autoFocus
              />

              <div className="mobile-custom-row-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setNewRowLabel('')
                    setShowRowEditor(false)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    addPlannerRow(newRowLabel)
                    setNewRowLabel('')
                    setShowRowEditor(false)
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {customRows.length > 0 && (
            <div className="mobile-custom-row-list" aria-label="Custom planner rows">
              {customRows.map((row) => (
                <div className="mobile-custom-row-item" key={row.id}>
                  <span>{row.label}</span>
                  <button
                    type="button"
                    className="mobile-custom-row-remove"
                    onClick={() => removePlannerRow(row.id)}
                    aria-label={`Remove ${row.label} row`}
                    title="Remove row"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {mobilePickerSlot && (
        <div className="mobile-meal-picker-backdrop" onClick={() => setMobilePickerSlot(null)}>
          <div
            className="mobile-meal-picker"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-picker-handle" />
            <div className="mobile-picker-header">
              <div>
                <div className="eyebrow">ADD MEAL</div>
                <h3>{mobilePickerSlot.label}</h3>
              </div>
              <button type="button" className="mobile-picker-close" onClick={() => setMobilePickerSlot(null)}>×</button>
            </div>

            <div className="meal-search-wrap mobile-picker-search">
              <span aria-hidden="true">⌕</span>
              <input
                className="meal-search"
                type="search"
                value={mealSearch}
                onChange={(event) => setMealSearch(event.target.value)}
                placeholder="Search meals…"
                autoFocus
              />
            </div>

            <div className="protein-filter mobile-picker-filters">
              <button type="button" className={proteinFilter === 'All' ? 'active' : ''} onClick={() => setProteinFilter('All')}>All</button>
              {proteinCategories.map((category) => (
                <button key={category.id} type="button" className={proteinFilter === category.id ? 'active' : ''} onClick={() => setProteinFilter(category.id)}>
                  <ProteinDot category={category} />{category.name}
                </button>
              ))}
            </div>

            <div className="mobile-picker-list">
              {filteredMeals.map((meal) => (
                <button
                  type="button"
                  className="mobile-picker-meal"
                  key={meal.id}
                  onClick={() => {
                    addMealToSlot(mobilePickerSlot.day, mobilePickerSlot.rowId, meal)
                    setMobilePickerSlot(null)
                  }}
                >
                  <MealProteinDots meal={meal} ingredients={state.ingredients} proteinCategories={proteinCategories} />
                  <span>{meal.name}</span>
                  <b>+</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
