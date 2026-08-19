import { useMemo, useState } from 'react'
import type { AppState, Meal, ProteinCategory } from '../types'
import { dateKey, formatRange } from '../utils/dates'
import { MealBrowser } from './MealBrowser'
import { MobileMealPicker } from './MobileMealPicker'
import type { MobilePickerSlot } from './MobileMealPicker'
import { PlannerRowEditor } from './PlannerRowEditor'
import { dayShort, defaultPlannerRows, filterMeals, getPlannerRows, getSlotMealIds } from './plannerUtils'
import { MobilePlannerSlot, PlannerSlot } from './PlannerSlots'

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
  const [mobilePickerSlot, setMobilePickerSlot] = useState<MobilePickerSlot | null>(null)
  const customRows = state.plannerRowsByWeek[dateKey(weekDates[0])] ?? []

  const filteredMeals = useMemo(
    () => filterMeals(state.meals, state.ingredients, proteinCategories, mealSearch, proteinFilter),
    [state.meals, state.ingredients, proteinCategories, mealSearch, proteinFilter],
  )

  function savePlannerRow() {
    addPlannerRow(newRowLabel)
    setNewRowLabel('')
    setShowRowEditor(false)
  }

  function cancelPlannerRow() {
    setNewRowLabel('')
    setShowRowEditor(false)
  }

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
        <MealBrowser
          open={showMealBrowser}
          meals={filteredMeals}
          ingredients={state.ingredients}
          proteinCategories={proteinCategories}
          search={mealSearch}
          proteinFilter={proteinFilter}
          onSearchChange={setMealSearch}
          onProteinFilterChange={setProteinFilter}
          onAddMeal={addMeal}
        />

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
              <PlannerRowEditor editing={showRowEditor} value={newRowLabel} onStart={() => setShowRowEditor(true)} onChange={setNewRowLabel} onSave={savePlannerRow} onCancel={cancelPlannerRow} />
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
          <PlannerRowEditor mobile editing={showRowEditor} value={newRowLabel} onStart={() => setShowRowEditor(true)} onChange={setNewRowLabel} onSave={savePlannerRow} onCancel={cancelPlannerRow} />

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
        <MobileMealPicker
          slot={mobilePickerSlot}
          meals={filteredMeals}
          ingredients={state.ingredients}
          proteinCategories={proteinCategories}
          search={mealSearch}
          proteinFilter={proteinFilter}
          onSearchChange={setMealSearch}
          onProteinFilterChange={setProteinFilter}
          onChoose={(meal) => {
            addMealToSlot(mobilePickerSlot.day, mobilePickerSlot.rowId, meal)
            setMobilePickerSlot(null)
          }}
          onClose={() => setMobilePickerSlot(null)}
        />
      )}
    </section>
  )
}
