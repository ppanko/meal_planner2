import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useDraggable } from '@dnd-kit/core'
import type { AppState, Ingredient, ManualShoppingItem, Meal, MealType, Planner, PlannerRow, ProteinCategory, ShoppingHistoryItem, ShoppingItem } from './types'
import { mealTypes } from './data'
import { loadState, saveState } from './storage'

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const defaultPlannerRows: PlannerRow[] = mealTypes.map((type) => ({ id: type, label: type }))

function getPlannerRows(state: AppState, weekDates: Date[]): PlannerRow[] {
  const weekKey = dateKey(weekDates[0])
  return [...defaultPlannerRows, ...(state.plannerRowsByWeek[weekKey] ?? [])]
}


function upsertShoppingHistory(
  history: ShoppingHistoryItem[],
  name: string,
): ShoppingHistoryItem[] {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return history

  const now = new Date().toISOString()
  const existing = history.find((item) => item.name.trim().toLowerCase() === normalized)

  if (existing) {
    return history.map((item) =>
      item.id === existing.id
        ? { ...item, name: name.trim(), lastPurchasedAt: now }
        : item,
    )
  }

  return [
    ...history,
    {
      id: crypto.randomUUID(),
      name: name.trim(),
      lastPurchasedAt: now,
    },
  ]
}

function getSlotMealIds(planner: Planner, day: string, rowId: string): string[] {
  return planner[day]?.[rowId] ?? []
}

function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [view, setView] = useState<'planner' | 'meals' | 'shopping'>('planner')
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeMealId, setActiveMealId] = useState<string | null>(null)
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [showMealForm, setShowMealForm] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState(false)

  useEffect(() => {
    loadState().then((loaded) => {
      setState(loaded)
      setStorageReady(true)
    })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])

  const shopping = useMemo(() => state ? buildShoppingList(state, weekDates, state.shoppingPurchasesByWeek[dateKey(weekDates[0])] ?? {}) : [], [state, weekDates])
  const shoppingWeekKey = dateKey(weekDates[0])
  const manualShopping = state?.manualShoppingItems[shoppingWeekKey] ?? []
  const shoppingPurchases = state?.shoppingPurchasesByWeek[shoppingWeekKey] ?? {}
  const activeMeal = activeMealId && state ? state.meals.find((m) => m.id === activeMealId) ?? null : null

  function update(next: AppState) {
    setState(next)
    void saveState(next)
  }

  function handleDragStart(event: { active: { id: string | number } }) {
    setActiveMealId(String(event.active.id).replace('meal-', ''))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveMealId(null)

    if (!event.over || !state) {
      return
    }

    const mealId = String(event.active.id).replace(/^meal-/, '')
    const targetId = String(event.over.id)

    if (!targetId.startsWith('slot:')) {
      return
    }

    const [, day, rowId] = targetId.split(':')

    if (!day || !rowId) {
      return
    }

    const meal = state.meals.find((m) => m.id === mealId)
    if (!meal) return

    const weekDatesForDay = getWeekDatesForDateKey(day)
    const validRowIds = new Set(getPlannerRows(state, weekDatesForDay).map((row) => row.id))
    if (!validRowIds.has(rowId)) return

    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    planner[day] ??= {}

    const current = planner[day][rowId] ?? []
    if (current.length >= 3) return

    planner[day][rowId] = [...current, meal.id]

    update({
      ...state,
      planner,
    })
  }

  function updatePlannerNote(day: string, rowId: string, note: string) {
    if (!state) return

    const plannerNotes = { ...state.plannerNotes }
    const dayNotes = { ...(plannerNotes[day] ?? {}) }
    const trimmed = note.trim()

    if (trimmed) {
      dayNotes[rowId] = trimmed
      plannerNotes[day] = dayNotes
    } else {
      delete dayNotes[rowId]

      if (Object.keys(dayNotes).length > 0) {
        plannerNotes[day] = dayNotes
      } else {
        delete plannerNotes[day]
      }
    }

    update({
      ...state,
      plannerNotes,
    })
  }

  function removeMeal(day: string, rowId: string, mealId: string) {
    if (!state) return

    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    const current = planner[day]?.[rowId] ?? []
    const next = current.filter((id) => id !== mealId)

    if (planner[day]) {
      planner[day][rowId] = next
    }

    // Keep the note if other meals remain in the slot; clear it only when the slot becomes empty.
    const plannerNotes = { ...state.plannerNotes }

    if (next.length === 0 && plannerNotes[day]) {
      const dayNotes = { ...plannerNotes[day] }
      delete dayNotes[rowId]

      if (Object.keys(dayNotes).length > 0) {
        plannerNotes[day] = dayNotes
      } else {
        delete plannerNotes[day]
      }
    }

    update({ ...state, planner, plannerNotes })
  }

  function addMeal(meal: Meal) {
    if (!state) return

    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    const currentWeekDates = getWeekDates(weekOffset)
    const currentWeekKeys = currentWeekDates.map(dateKey)
    const rows = getPlannerRows(state, currentWeekDates)

    for (const dayKey of currentWeekKeys) {
      planner[dayKey] ??= {}

      for (const row of rows) {
        const current = planner[dayKey][row.id] ?? []

        if (current.length < 3) {
          planner[dayKey][row.id] = [...current, meal.id]
          update({ ...state, planner })
          setView('planner')
          return
        }
      }
    }
  }

  function addPlannerRow(label: string) {
    if (!state) return

    const weekKey = dateKey(getWeekDates(weekOffset)[0])
    const rows = state.plannerRowsByWeek[weekKey] ?? []
    const trimmed = label.trim()
    const unnamedCount = rows.filter((row) => row.label.startsWith('Extra meal')).length

    const row: PlannerRow = {
      id: `custom-${crypto.randomUUID()}`,
      label: trimmed || `Extra meal${unnamedCount ? ` ${unnamedCount + 1}` : ''}`,
    }

    update({
      ...state,
      plannerRowsByWeek: {
        ...state.plannerRowsByWeek,
        [weekKey]: [...rows, row],
      },
    })
  }

  function removePlannerRow(rowId: string) {
    if (!state) return

    const weekDates = getWeekDates(weekOffset)
    const weekKey = dateKey(weekDates[0])
    const rows = state.plannerRowsByWeek[weekKey] ?? []
    const row = rows.find((item) => item.id === rowId)
    if (!row) return

    const hasMeals = weekDates.some((date) => (state.planner[dateKey(date)]?.[rowId]?.length ?? 0) > 0)
    if (hasMeals && !confirm(`Remove "${row.label}" and its planned meals from this week?`)) {
      return
    }

    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    const plannerNotes = { ...state.plannerNotes }

    for (const date of weekDates) {
      const dayKey = dateKey(date)

      if (planner[dayKey]) {
        delete planner[dayKey][rowId]
      }

      if (plannerNotes[dayKey]) {
        const dayNotes = { ...plannerNotes[dayKey] }
        delete dayNotes[rowId]

        if (Object.keys(dayNotes).length > 0) {
          plannerNotes[dayKey] = dayNotes
        } else {
          delete plannerNotes[dayKey]
        }
      }
    }

    const nextRows = rows.filter((item) => item.id !== rowId)
    const plannerRowsByWeek = { ...state.plannerRowsByWeek }

    if (nextRows.length > 0) {
      plannerRowsByWeek[weekKey] = nextRows
    } else {
      delete plannerRowsByWeek[weekKey]
    }

    update({
      ...state,
      planner,
      plannerRowsByWeek,
      plannerNotes,
    })
  }

  function saveMeal(meal: Meal, oldId?: string) {
    if (!state) return
    const meals = oldId
      ? state.meals.map((m) => m.id === oldId ? meal : m)
      : [...state.meals, meal]
    update({ ...state, meals })
    setDuplicateMode(false)
    setEditingMeal(null)
    setShowMealForm(false)
  }

  function duplicateMeal(meal: Meal) {
    const duplicate: Meal = {
      ...meal,
      id: crypto.randomUUID(),
      name: `${meal.name} Copy`,
      ingredients: meal.ingredients.map((item) => ({ ...item })),
    }

    setDuplicateMode(true)
    setEditingMeal(duplicate)
    setShowMealForm(true)
    setView('meals')
  }

  function deleteMeal(mealId: string) {
    if (!state) return
    if (!confirm('Delete this meal? It will also be removed from the planner.')) return

    const planner: Planner = JSON.parse(JSON.stringify(state.planner))

    for (const day of Object.keys(planner)) {
      for (const rowId of Object.keys(planner[day] ?? {})) {
        planner[day][rowId] = (planner[day][rowId] ?? []).filter((id) => id !== mealId)
      }
    }

    update({
      ...state,
      meals: state.meals.filter((m) => m.id !== mealId),
      planner,
    })
  }

  function toggleShopping(lineId: string) {
    if (!state) return

    const item = shopping.find((entry) => entry.lineId === lineId)
    if (!item) return

    const currentPurchases = state.shoppingPurchasesByWeek[shoppingWeekKey] ?? {}
    const currentPurchased = currentPurchases[item.ingredientId] ?? 0
    const nextPurchases = { ...currentPurchases }

    if (item.checked) {
      // Unchecking the purchased line returns the full purchased amount to outstanding.
      delete nextPurchases[item.ingredientId]
    } else {
      // Checking an outstanding delta adds it to the amount already purchased.
      nextPurchases[item.ingredientId] = currentPurchased + item.quantity
    }

    const ingredient = state.ingredients.find((entry) => entry.id === item.ingredientId)

    update({
      ...state,
      shoppingPurchasesByWeek: {
        ...state.shoppingPurchasesByWeek,
        [shoppingWeekKey]: nextPurchases,
      },
      shoppingHistory:
        !item.checked && ingredient
          ? upsertShoppingHistory(state.shoppingHistory, ingredient.name)
          : state.shoppingHistory,
    })
  }

  function addManualShoppingItem(name: string) {
    if (!state) return
    const trimmed = name.trim()
    if (!trimmed) return

    const item: ManualShoppingItem = {
      id: crypto.randomUUID(),
      name: trimmed,
      checked: false,
    }

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    update({
      ...state,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: [...current, item],
      },
    })
  }

  function addHistoryItemToShopping(name: string) {
    if (!state) return

    const trimmed = name.trim()
    if (!trimmed) return

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const alreadyPresent = current.some(
      (item) => item.name.trim().toLowerCase() === trimmed.toLowerCase(),
    )

    if (alreadyPresent) return

    const item: ManualShoppingItem = {
      id: crypto.randomUUID(),
      name: trimmed,
      checked: false,
    }

    update({
      ...state,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: [...current, item],
      },
    })
  }

  function deleteShoppingHistoryItem(id: string) {
    if (!state) return

    update({
      ...state,
      shoppingHistory: state.shoppingHistory.filter((item) => item.id !== id),
    })
  }

  function toggleManualShoppingItem(id: string) {
    if (!state) return

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const target = current.find((item) => item.id === id)
    if (!target) return

    const nextChecked = !target.checked

    update({
      ...state,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: current.map((item) =>
          item.id === id ? { ...item, checked: nextChecked } : item,
        ),
      },
      shoppingHistory: nextChecked
        ? upsertShoppingHistory(state.shoppingHistory, target.name)
        : state.shoppingHistory,
    })
  }

  function deleteManualShoppingItem(id: string) {
    if (!state) return
    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    update({
      ...state,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: current.filter((item) => item.id !== id),
      },
    })
  }

  function clearCheckedShopping() {
    if (!state) return

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const shoppingPurchasesByWeek = { ...state.shoppingPurchasesByWeek }
    delete shoppingPurchasesByWeek[shoppingWeekKey]

    update({
      ...state,
      shoppingPurchasesByWeek,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: current.map((item) => ({ ...item, checked: false })),
      },
    })
  }

  function clearWeek() {
    if (!state) return

    const weekKeys = getWeekDates(weekOffset).map(dateKey)
    const planner: Planner = JSON.parse(JSON.stringify(state.planner))

    const plannerNotes = { ...state.plannerNotes }

    for (const dayKey of weekKeys) {
      delete planner[dayKey]
      delete plannerNotes[dayKey]
    }

    if (!confirm(`Clear all planned meals for ${formatRange(getWeekDates(weekOffset))}?`)) {
      return
    }

    const weekKey = dateKey(getWeekDates(weekOffset)[0])
    const plannerRowsByWeek = { ...state.plannerRowsByWeek }
    delete plannerRowsByWeek[weekKey]

    update({
      ...state,
      planner,
      plannerRowsByWeek,
      plannerNotes,
    })
  }

  if (!storageReady || !state) {
    return <div className="loading-screen"><div className="loading-card">Loading Meal Planner…</div></div>
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">PERSONAL</div>
            <h1>Meal Planner</h1>
          </div>
          <button className="text-button" onClick={clearWeek}>Clear week</button>
        </header>

        <main className="content">
          {view === 'planner' && (
            <PlannerView
              state={state}
              weekDates={weekDates}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              addMeal={addMeal}
              removeMeal={removeMeal}
              updatePlannerNote={updatePlannerNote}
              addPlannerRow={addPlannerRow}
              removePlannerRow={removePlannerRow}
              proteinCategories={state.proteinCategories}
            />
          )}
          {view === 'meals' && (
            <MealsView
              meals={state.meals}
              ingredients={state.ingredients}
              onNew={() => { setDuplicateMode(false); setEditingMeal(null); setShowMealForm(true) }}
              onEdit={(meal) => { setDuplicateMode(false); setEditingMeal(meal); setShowMealForm(true) }}
              onDelete={deleteMeal}
              onDuplicate={duplicateMeal}
              proteinCategories={state.proteinCategories}
            />
          )}
          {view === 'shopping' && (
            <ShoppingView
              shopping={shopping}
              manualItems={manualShopping}
              onToggle={toggleShopping}
              onAddManual={addManualShoppingItem}
              onToggleManual={toggleManualShoppingItem}
              onDeleteManual={deleteManualShoppingItem}
              onClearChecked={clearCheckedShopping}
              history={state.shoppingHistory}
              onAddHistory={addHistoryItemToShopping}
              onDeleteHistory={deleteShoppingHistoryItem}
              weekDates={weekDates}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
            />
          )}
        </main>

        <nav className="bottom-nav">
          <button className={view === 'planner' ? 'active' : ''} onClick={() => setView('planner')}>
            <span>▦</span><small>Planner</small>
          </button>
          <button className={view === 'meals' ? 'active' : ''} onClick={() => setView('meals')}>
            <span>☷</span><small>Meals</small>
          </button>
          <button className={view === 'shopping' ? 'active' : ''} onClick={() => setView('shopping')}>
            <span>✓</span><small>Shopping</small>
            {(shopping.some((x) => !x.checked) || manualShopping.some((x) => !x.checked)) && <i />}
          </button>
        </nav>

        {showMealForm && (
          <MealForm
            meal={editingMeal}
            ingredients={state.ingredients}
            proteinCategories={state.proteinCategories}
            duplicateMode={duplicateMode}
            onCancel={() => { setDuplicateMode(false); setEditingMeal(null); setShowMealForm(false) }}
            onSave={saveMeal}
            onCreateIngredient={(ingredient) => update({ ...state, ingredients: [...state.ingredients, ingredient] })}
            onCreateProteinCategory={(category) =>
              update({ ...state, proteinCategories: [...state.proteinCategories, category] })
            }
          />
        )}
      </div>
      <DragOverlay>{activeMeal ? <MealCard meal={activeMeal} overlay ingredients={state.ingredients} proteinCategories={state.proteinCategories} /> : null}</DragOverlay>
    </DndContext>
  )
}

function ProteinDot({ category }: { category: ProteinCategory | undefined }) {
  return (
    <span
      className="protein-dot"
      style={{ backgroundColor: category?.color ?? '#6f8f72' }}
      aria-label={category?.name ?? 'None'}
      title={category?.name ?? 'None'}
    />
  )
}

function getMealProteinCategories(
  meal: Meal,
  ingredients: Ingredient[],
  proteinCategories: ProteinCategory[],
): ProteinCategory[] {
  if (meal.proteinCategoryOverrideId) {
    const override = proteinCategories.find(
      (category) => category.id === meal.proteinCategoryOverrideId,
    )
    return override ? [override] : []
  }

  const ids = new Set(
    meal.ingredients
      .map((item) =>
        ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.proteinCategoryId,
      )
      .filter((id): id is string => Boolean(id)),
  )

  return [...ids]
    .map((id) => proteinCategories.find((category) => category.id === id))
    .filter((category): category is ProteinCategory => Boolean(category))
}

function MealProteinDots({
  meal,
  ingredients,
  proteinCategories,
}: {
  meal: Meal
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
}) {
  const categories = getMealProteinCategories(meal, ingredients, proteinCategories)

  if (categories.length === 0) {
    const none = proteinCategories.find((category) => category.id === 'none')
    return <ProteinDot category={none} />
  }

  return (
    <span className="protein-dot-group">
      {categories.map((category) => (
        <ProteinDot key={category.id} category={category} />
      ))}
    </span>
  )
}

function PlannerView({
  state,
  weekDates,
  weekOffset,
  setWeekOffset,
  addMeal,
  removeMeal,
  updatePlannerNote,
  addPlannerRow,
  removePlannerRow,
  proteinCategories,
}: {
  state: AppState
  weekDates: Date[]
  weekOffset: number
  setWeekOffset: (n: number) => void
  addMeal: (meal: Meal) => void
  removeMeal: (day: string, rowId: string, mealId: string) => void
  updatePlannerNote: (day: string, rowId: string, note: string) => void
  addPlannerRow: (label: string) => void
  removePlannerRow: (rowId: string) => void
  proteinCategories: ProteinCategory[]
}) {
  const [mealSearch, setMealSearch] = useState('')
  const [proteinFilter, setProteinFilter] = useState<string | 'All'>('All')
  const [showMealBrowser, setShowMealBrowser] = useState(false)
  const [newRowLabel, setNewRowLabel] = useState('')
  const [showRowEditor, setShowRowEditor] = useState(false)

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
        <div className="week-controls">
          <button onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
          <button onClick={() => setWeekOffset(0)}>Today</button>
          <button onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
        </div>
      </div>

      <button
        className="mobile-meal-browser-toggle"
        type="button"
        onClick={() => setShowMealBrowser((open) => !open)}
      >
        {showMealBrowser ? 'Hide meals' : 'Browse meals'}
        <span>{filteredMeals.length}</span>
      </button>

      <div className="planner-layout">
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
    </section>
  )
}

function DraggableMeal({ meal, onTap, ingredients, proteinCategories }: { meal: Meal; onTap: () => void; ingredients: Ingredient[]; proteinCategories: ProteinCategory[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `meal-${meal.id}`,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`meal-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={onTap}
    >
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
      <span className="meal-card-name">{meal.name}</span>
    </button>
  )
}

function MealCard({ meal, overlay = false, ingredients, proteinCategories }: { meal: Meal; overlay?: boolean; ingredients: Ingredient[]; proteinCategories: ProteinCategory[] }) {
  return (
    <div className={`meal-card ${overlay ? 'overlay-card' : ''}`}>
      <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
      <span>{meal.name}</span>
    </div>
  )
}

function PlannerSlot({
  day,
  rowId,
  meals,
  note,
  onNoteChange,
  onRemoveMeal,
  ingredients,
  proteinCategories,
}: {
  day: string
  rowId: string
  meals: Meal[]
  note: string
  onNoteChange: (note: string) => void
  onRemoveMeal: (mealId: string) => void
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${day}:${rowId}`,
  })

  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(note)

  useEffect(() => {
    setDraftNote(note)
  }, [note])

  return (
    <div
      ref={setNodeRef}
      className={`planner-slot ${isOver ? 'drag-over' : ''}`}
    >
      {meals.length > 0 ? (
        <div className="planned-meal-stack">
          {meals.map((mealData) => (
            <div className="planned-meal" key={mealData.id}>
              <div className="planned-meal-main">
                <MealProteinDots meal={mealData} ingredients={ingredients} proteinCategories={proteinCategories} />
                <span>{mealData.name}</span>
                <button
                  type="button"
                  className="remove-slot-meal"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveMeal(mealData.id)
                  }}
                  aria-label={`Remove ${mealData.name} from slot`}
                  title="Remove meal"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          {note && !editingNote && (
            <div className="planner-note-preview">{note}</div>
          )}

          {editingNote ? (
            <div
              className="planner-note-editor"
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <textarea
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Add a note…"
                autoFocus
              />
              <div className="planner-note-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setDraftNote(note)
                    setEditingNote(false)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="save-note"
                  onClick={(event) => {
                    event.stopPropagation()
                    onNoteChange(draftNote)
                    setEditingNote(false)
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`planner-note-button ${note ? 'has-note' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                setEditingNote(true)
              }}
            >
              {note ? 'Edit note' : '+ Note'}
            </button>
          )}
        </div>
      ) : (
        <span className="empty-slot">Drop meal here</span>
      )}
    </div>
  )
}

function MealsView({ meals, ingredients, onNew, onEdit, onDelete, onDuplicate, proteinCategories }: {
  meals: Meal[]; ingredients: Ingredient[]; onNew: () => void; onEdit: (m: Meal) => void; onDelete: (id: string) => void; onDuplicate: (m: Meal) => void; proteinCategories: ProteinCategory[]
}) {
  return (
    <section>
      <div className="section-header">
        <div><div className="eyebrow">LIBRARY</div><h2>Your Meals</h2></div>
        <button className="primary" onClick={onNew}>+ New meal</button>
      </div>
      <div className="meal-library-full">
        {mealTypes.map((type) => {
          const group = meals.filter((m) => m.type === type)
          return <div key={type} className="meal-library-section"><h3>{type}</h3>{group.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onDuplicate={() => onDuplicate(meal)} />)}</div>
        })}
      </div>
    </section>
  )
}

function MealEditorCard({ meal, ingredients, proteinCategories, onEdit, onDelete, onDuplicate }: { meal: Meal; ingredients: Ingredient[]; proteinCategories: ProteinCategory[]; onEdit: () => void; onDelete: () => void; onDuplicate: () => void }) {
  return (
    <article className="meal-detail-card">
      <div className="meal-detail-top">
        <h3><MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />{meal.name}</h3>
        <span className="pill">{meal.type}</span>
      </div>
      <ul>{meal.ingredients.map((mi) => { const ing = ingredients.find((i) => i.id === mi.ingredientId); return ing ? <li key={mi.ingredientId}>{formatQuantity(mi.quantity)} {ing.unit} {ing.name}</li> : null })}</ul>
      <div className="card-actions"><button onClick={onDuplicate}>Duplicate meal</button><button onClick={onEdit}>Edit</button><button className="danger-text" onClick={onDelete}>Delete</button></div>
    </article>
  )
}

function MealForm({ meal, ingredients, proteinCategories, duplicateMode = false, onCancel, onSave, onCreateIngredient, onCreateProteinCategory }: {
  meal: Meal | null | undefined; ingredients: Ingredient[]; proteinCategories: ProteinCategory[]; duplicateMode?: boolean; onCancel: () => void; onSave: (meal: Meal, oldId?: string) => void; onCreateIngredient: (ingredient: Ingredient) => void; onCreateProteinCategory: (category: ProteinCategory) => void
}) {
  const [name, setName] = useState(meal?.name ?? '')
  const [type, setType] = useState<MealType>(meal?.type ?? 'Dinner')
  const [proteinCategoryOverrideId, setProteinCategoryOverrideId] = useState(meal?.proteinCategoryOverrideId ?? '')
  const [newProteinCategory, setNewProteinCategory] = useState('')
  const [newProteinColor, setNewProteinColor] = useState('#8a7f70')
  const [rows, setRows] = useState(meal?.ingredients ?? [])
  const [newIngredient, setNewIngredient] = useState('')
  const [newIngredientProteinCategoryId, setNewIngredientProteinCategoryId] = useState('')

  function addRow() {
    const first = ingredients[0]
    if (first) setRows([...rows, { ingredientId: first.id, quantity: 1 }])
  }
  function addNewIngredient() {
    const trimmed = newIngredient.trim()
    if (!trimmed) return
    const id = slug(trimmed)
    const ingredient: Ingredient = { id, name: trimmed, unit: 'each', proteinCategoryId: newIngredientProteinCategoryId || null }
    onCreateIngredient(ingredient)
    setRows([...rows, { ingredientId: id, quantity: 1 }])
    setNewIngredient('')
    setNewIngredientProteinCategoryId('')
  }
  function save() {
    if (!name.trim() || rows.length === 0) return
    onSave(
      {
        id: meal?.id ?? crypto.randomUUID(),
        name: name.trim(),
        type,
        proteinCategoryOverrideId: proteinCategoryOverrideId || null,
        ingredients: rows,
      },
      duplicateMode ? undefined : meal?.id,
    )
  }

  return (
    <div className="modal-backdrop"><div className="modal">
      <div className="modal-header"><h2>{duplicateMode ? 'Duplicate meal' : meal ? 'Edit meal' : 'New meal'}</h2><button onClick={onCancel}>×</button></div>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken tacos" autoFocus /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value as MealType)}>{mealTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>
        Protein
        <select
          value={proteinCategoryOverrideId}
          onChange={(e) => setProteinCategoryOverrideId(e.target.value)}
        >
          <option value="">Auto from ingredients</option>
          {proteinCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <div className="protein-guide">
        {proteinCategories.map((category) => (
          <span key={category.id}><ProteinDot category={category} />{category.name}</span>
        ))}
      </div>
      <div className="new-protein-category">
        <input
          value={newProteinCategory}
          onChange={(e) => setNewProteinCategory(e.target.value)}
          placeholder="New protein category"
        />
        <input
          className="protein-color-picker"
          type="color"
          value={newProteinColor}
          onChange={(e) => setNewProteinColor(e.target.value)}
          aria-label="Protein category color"
          title="Choose category color"
        />
        <button
          type="button"
          onClick={() => {
            const categoryName = newProteinCategory.trim()
            if (!categoryName) return

            const id = slug(categoryName)
            const existing = proteinCategories.find((category) => category.id === id)
            if (existing) {
              setProteinCategoryOverrideId(existing.id)
              setNewProteinCategory('')
              return
            }

            const category: ProteinCategory = {
              id,
              name: categoryName,
              color: newProteinColor,
            }

            onCreateProteinCategory(category)
            setProteinCategoryOverrideId(id)
            setNewProteinCategory('')
          }}
        >
          Add category
        </button>
      </div>
      <div className="ingredients-editor"><div className="editor-label">Ingredients</div>
        {rows.map((row, index) => <div className="ingredient-row" key={`${row.ingredientId}-${index}`}>
          <select value={row.ingredientId} onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, ingredientId: e.target.value } : r))}>{ingredients.map((i) => <option value={i.id} key={i.id}>{i.name}</option>)}</select>
          <input type="number" min="0" step="0.25" value={row.quantity} onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
          <span>{ingredients.find((i) => i.id === row.ingredientId)?.unit ?? ''}</span>
          <span className="ingredient-protein-indicator">
            {(() => {
              const ingredient = ingredients.find((i) => i.id === row.ingredientId)
              const category = proteinCategories.find((c) => c.id === ingredient?.proteinCategoryId)
              return category ? <><ProteinDot category={category} />{category.name}</> : '—'
            })()}
          </span>
          <button onClick={() => setRows(rows.filter((_, i) => i !== index))}>×</button>
        </div>)}
        <button className="secondary" onClick={addRow}>+ Add ingredient</button>
        <div className="new-ingredient">
          <input
            value={newIngredient}
            onChange={(e) => setNewIngredient(e.target.value)}
            placeholder="New ingredient"
          />
          <select
            value={newIngredientProteinCategoryId}
            onChange={(e) => setNewIngredientProteinCategoryId(e.target.value)}
            aria-label="New ingredient protein category"
          >
            <option value="">No protein</option>
            {proteinCategories
              .filter((category) => category.id !== 'none')
              .map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
          </select>
          <button onClick={addNewIngredient}>Create</button>
        </div>
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={save}>Save meal</button></div>
    </div></div>
  )
}

function ShoppingView({
  shopping,
  manualItems,
  onToggle,
  onAddManual,
  onToggleManual,
  onDeleteManual,
  onClearChecked,
  history,
  onAddHistory,
  onDeleteHistory,
  weekDates,
  weekOffset,
  setWeekOffset,
}: {
  shopping: ShoppingItem[]
  manualItems: ManualShoppingItem[]
  onToggle: (lineId: string) => void
  onAddManual: (name: string) => void
  onToggleManual: (id: string) => void
  onDeleteManual: (id: string) => void
  onClearChecked: () => void
  history: ShoppingHistoryItem[]
  onAddHistory: (name: string) => void
  onDeleteHistory: (id: string) => void
  weekDates: Date[]
  weekOffset: number
  setWeekOffset: (n: number) => void
}) {
  const [newItem, setNewItem] = useState('')
  const [historySearch, setHistorySearch] = useState('')

  const remaining =
    shopping.filter((i) => !i.checked).length +
    manualItems.filter((i) => !i.checked).length

  const hasItems = shopping.length > 0 || manualItems.length > 0
  const hasChecked =
    shopping.some((item) => item.checked) ||
    manualItems.some((item) => item.checked)

  const combinedShoppingItems = useMemo(() => {
    const mealItems = shopping.map((item) => ({
      kind: 'meal' as const,
      id: item.lineId,
      ingredientId: item.ingredientId,
      name: item.name,
      checked: item.checked,
      unit: item.unit,
      quantity: item.quantity,
    }))

    const manual = manualItems.map((item) => ({
      kind: 'manual' as const,
      id: item.id,
      name: item.name,
      checked: item.checked,
      unit: '',
      quantity: null,
    }))

    return [...mealItems, ...manual].sort((a, b) => {
      if (a.checked !== b.checked) {
        return Number(a.checked) - Number(b.checked)
      }

      return a.name.localeCompare(b.name)
    })
  }, [shopping, manualItems])

  const toBuyItems = combinedShoppingItems.filter((item) => !item.checked)
  const purchasedItems = combinedShoppingItems.filter((item) => item.checked)

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase()

    return [...history]
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const dateDiff =
          new Date(b.lastPurchasedAt).getTime() -
          new Date(a.lastPurchasedAt).getTime()

        return dateDiff || a.name.localeCompare(b.name)
      })
  }, [history, historySearch])

  function submitManualItem(event: FormEvent) {
    event.preventDefault()
    const trimmed = newItem.trim()
    if (!trimmed) return

    onAddManual(trimmed)
    setNewItem('')
  }

  return (
    <section>
      <div className="section-header">
        <div>
          <div className="eyebrow">SHOPPING</div>
          <h2>{formatRange(weekDates)}</h2>
        </div>

        <div className="week-controls">
          <button onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
          <button onClick={() => setWeekOffset(0)}>Today</button>
          <button onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
        </div>
      </div>

      <div className="shopping-layout">
        <div className="shopping-current">
          <form className="shopping-add" onSubmit={submitManualItem}>
            <input
              type="text"
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add anything to the shopping list…"
              aria-label="Add shopping list item"
            />
            <button className="primary" type="submit">Add</button>
          </form>

          {hasChecked && (
            <div style={{ marginBottom: 14 }}>
              <button className="secondary" onClick={onClearChecked}>Clear checks</button>
            </div>
          )}

          {!hasItems ? (
            <div className="empty-state">
              <h3>Shopping list is empty</h3>
              <p>Add an item above, reuse a past item, or plan meals for this week.</p>
            </div>
          ) : (
            <>
              <p className="shopping-summary">
                {remaining} item{remaining === 1 ? '' : 's'} remaining
              </p>

              <div className="shopping-list">
                <div className="shopping-group-label">
                  <span>To buy</span>
                  <small>{toBuyItems.length}</small>
                </div>

                {toBuyItems.map((item) =>
                  item.kind === 'meal' ? (
                    <label
                      className="shopping-item"
                      key={`meal-${item.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onToggle(item.id)}
                      />
                      <span className="checkmark" />
                      <span className="shopping-name">
                        {item.name}
                        {item.id.startsWith('outstanding:') && (
                          <small className="shopping-status">Additional</small>
                        )}
                      </span>
                      <strong>
                        {formatQuantity(item.quantity)} {item.unit}
                      </strong>
                    </label>
                  ) : (
                    <div
                      className="shopping-item manual-shopping-item"
                      key={`manual-${item.id}`}
                    >
                      <input
                        className="manual-shopping-checkbox"
                        type="checkbox"
                        checked={false}
                        onChange={() => onToggleManual(item.id)}
                        aria-label={`Mark ${item.name} purchased`}
                      />
                      <span className="checkmark" onClick={() => onToggleManual(item.id)} />
                      <span className="shopping-name" onClick={() => onToggleManual(item.id)}>
                        {item.name}
                      </span>
                      <button
                        className="shopping-delete"
                        type="button"
                        onClick={() => onDeleteManual(item.id)}
                        aria-label={`Delete ${item.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ),
                )}

                {purchasedItems.length > 0 && (
                  <>
                    <div className="shopping-group-label purchased-group-label">
                      <span>Purchased</span>
                      <small>{purchasedItems.length}</small>
                    </div>

                    {purchasedItems.map((item) =>
                      item.kind === 'meal' ? (
                        <label
                          className="shopping-item checked"
                          key={`meal-${item.id}`}
                        >
                          <input
                            type="checkbox"
                            checked
                            onChange={() => onToggle(item.id)}
                          />
                          <span className="checkmark" />
                          <span className="shopping-name">
                            {item.name}
                            <small className="shopping-status">Purchased</small>
                          </span>
                          <strong>
                            {formatQuantity(item.quantity)} {item.unit}
                          </strong>
                        </label>
                      ) : (
                        <div
                          className="shopping-item manual-shopping-item checked"
                          key={`manual-${item.id}`}
                        >
                          <input
                            className="manual-shopping-checkbox"
                            type="checkbox"
                            checked
                            onChange={() => onToggleManual(item.id)}
                            aria-label={`Mark ${item.name} not purchased`}
                          />
                          <span className="checkmark" onClick={() => onToggleManual(item.id)} />
                          <span className="shopping-name" onClick={() => onToggleManual(item.id)}>
                            {item.name}
                          </span>
                          <button
                            className="shopping-delete"
                            type="button"
                            onClick={() => onDeleteManual(item.id)}
                            aria-label={`Delete ${item.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ),
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="shopping-history">
          <div className="shopping-history-header">
            <div>
              <div className="eyebrow">PAST ITEMS</div>
              <h3>Previously purchased</h3>
            </div>
            <span>{history.length}</span>
          </div>

          <input
            className="history-search"
            type="search"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search past items…"
            aria-label="Search past shopping items"
          />

          {filteredHistory.length === 0 ? (
            <div className="history-empty">
              Checked-off shopping items will appear here for quick reuse.
            </div>
          ) : (
            <div className="history-table">
              {filteredHistory.map((item) => (
                <div className="history-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      Last purchased {formatHistoryDate(item.lastPurchasedAt)}
                    </small>
                  </div>

                  <button
                    className="history-add"
                    type="button"
                    onClick={() => onAddHistory(item.name)}
                  >
                    + Add
                  </button>

                  <button
                    className="history-delete"
                    type="button"
                    onClick={() => onDeleteHistory(item.id)}
                    aria-label={`Remove ${item.name} from past items`}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}


function buildShoppingList(
  state: AppState,
  weekDates: Date[],
  purchases: Record<string, number>,
): ShoppingItem[] {
  const required = new Map<string, number>()

  for (const day of weekDates.map(dateKey)) {
    const dayPlan = state.planner[day] ?? {}

    for (const mealIds of Object.values(dayPlan)) {
      for (const mealId of mealIds ?? []) {
        const meal = state.meals.find((m) => m.id === mealId) ?? null
        if (!meal) continue

        for (const item of meal.ingredients) {
          required.set(
            item.ingredientId,
            (required.get(item.ingredientId) ?? 0) + item.quantity,
          )
        }
      }
    }
  }

  const ingredientIds = new Set([
    ...required.keys(),
    ...Object.keys(purchases).filter((id) => (purchases[id] ?? 0) > 0),
  ])

  const lines: ShoppingItem[] = []

  for (const ingredientId of ingredientIds) {
    const ingredient = state.ingredients.find((item) => item.id === ingredientId)
    if (!ingredient) continue

    const requiredQuantity = required.get(ingredientId) ?? 0
    const purchasedQuantity = purchases[ingredientId] ?? 0
    const outstandingQuantity = Math.max(requiredQuantity - purchasedQuantity, 0)

    if (purchasedQuantity > 0) {
      lines.push({
        lineId: `purchased:${ingredientId}`,
        ingredientId,
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: purchasedQuantity,
        checked: true,
      })
    }

    if (outstandingQuantity > 0) {
      lines.push({
        lineId: `outstanding:${ingredientId}`,
        ingredientId,
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: outstandingQuantity,
        checked: false,
      })
    }
  }

  return lines.sort((a, b) => {
    if (a.checked !== b.checked) {
      return Number(a.checked) - Number(b.checked)
    }

    return a.name.localeCompare(b.name)
  })
}

function formatHistoryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

function getWeekDatesForDateKey(key: string): Date[] {
  const date = new Date(`${key}T12:00:00`)
  const monday = new Date(date)

  const day = monday.getDay() || 7
  monday.setDate(monday.getDate() - day + 1)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function dateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekDates(offset: number) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const monday = new Date(today)
  const day = monday.getDay() || 7
  monday.setDate(monday.getDate() - day + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
}

function formatRange(dates: Date[]) {
  const a = dates[0], b = dates[6]
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, opts)}`
}

function formatQuantity(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID()
}

export default App
