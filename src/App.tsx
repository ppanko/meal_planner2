import { useEffect, useMemo, useState } from 'react'
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
import type { AppState, Ingredient, Meal, MealType, Planner, ShoppingItem } from './types'
import { mealTypes } from './data'
import { loadState, resetState, saveState } from './storage'

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [view, setView] = useState<'planner' | 'meals' | 'shopping'>('planner')
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeMealId, setActiveMealId] = useState<string | null>(null)
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [showMealForm, setShowMealForm] = useState(false)

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
  const mealsByType = useMemo(() => {
    if (!state) return { Breakfast: [], Lunch: [], Dinner: [] } as Record<MealType, Meal[]>
    return mealTypes.reduce((acc, type) => {
      acc[type] = state.meals.filter((meal) => meal.type === type)
      return acc
    }, {} as Record<MealType, Meal[]>)
  }, [state?.meals])

  const shopping = useMemo(() => state ? buildShoppingList(state, weekDates) : [], [state, weekDates])
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
    if (!state) return
    const mealId = String(event.active.id).replace('meal-', '')
    const target = event.over?.id ? String(event.over.id) : null
    if (!target?.startsWith('slot-')) return
    const [, day, type] = target.split('|')
    if (!day || !mealTypes.includes(type as MealType)) return

    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    planner[day] ??= { Breakfast: null, Lunch: null, Dinner: null }
    planner[day][type as MealType] = mealId
    update({ ...state, planner })
  }

  function removeMeal(day: string, type: MealType) {
    if (!state) return
    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    if (planner[day]) planner[day][type] = null
    update({ ...state, planner })
  }

  function addMeal(meal: Meal) {
    if (!state) return
    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    const currentWeekKeys = getWeekDates(weekOffset).map(dateKey)
    for (const dayKey of currentWeekKeys) {
      planner[dayKey] ??= { Breakfast: null, Lunch: null, Dinner: null }
      for (const type of mealTypes) {
        if (!planner[dayKey][type]) {
          planner[dayKey][type] = meal.id
          update({ ...state, planner })
          setView('planner')
          return
        }
      }
    }
  }

  function saveMeal(meal: Meal, oldId?: string) {
    if (!state) return
    const meals = oldId
      ? state.meals.map((m) => m.id === oldId ? meal : m)
      : [...state.meals, meal]
    update({ ...state, meals })
    setEditingMeal(null)
    setShowMealForm(false)
  }

  function deleteMeal(mealId: string) {
    if (!state) return
    if (!confirm('Delete this meal? It will also be removed from the planner.')) return
    const planner: Planner = JSON.parse(JSON.stringify(state.planner))
    for (const day of Object.keys(planner)) {
      if (!planner[day]) continue
      for (const type of mealTypes) if (planner[day][type] === mealId) planner[day][type] = null
    }
    update({ ...state, meals: state.meals.filter((m) => m.id !== mealId), planner })
  }

  function toggleShopping(id: string) {
    if (!state) return
    update({
      ...state,
      shoppingChecked: { ...state.shoppingChecked, [id]: !state.shoppingChecked[id] },
    })
  }

  function clearCheckedShopping() {
    if (!state) return
    update({ ...state, shoppingChecked: {} })
  }

  async function resetApp() {
    if (!confirm('Reset all meals and planner data to the examples?')) return
    await resetState()
    const loaded = await loadState()
    setState(loaded)
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
          <button className="text-button" onClick={resetApp}>Reset examples</button>
        </header>

        <main className="content">
          {view === 'planner' && (
            <PlannerView
              state={state}
              weekDates={weekDates}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              mealsByType={mealsByType}
              addMeal={addMeal}
              removeMeal={removeMeal}
            />
          )}
          {view === 'meals' && (
            <MealsView
              meals={state.meals}
              ingredients={state.ingredients}
              onNew={() => { setEditingMeal(null); setShowMealForm(true) }}
              onEdit={(meal) => { setEditingMeal(meal); setShowMealForm(true) }}
              onDelete={deleteMeal}
              onAdd={addMeal}
            />
          )}
          {view === 'shopping' && (
            <ShoppingView shopping={shopping} onToggle={toggleShopping} onClearChecked={clearCheckedShopping} weekDates={weekDates} weekOffset={weekOffset} setWeekOffset={setWeekOffset} />
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
            {shopping.some((x) => !x.checked) && <i />}
          </button>
        </nav>

        {showMealForm && (
          <MealForm
            meal={editingMeal}
            ingredients={state.ingredients}
            onCancel={() => { setEditingMeal(null); setShowMealForm(false) }}
            onSave={saveMeal}
            onCreateIngredient={(ingredient) => update({ ...state, ingredients: [...state.ingredients, ingredient] })}
          />
        )}
      </div>
      <DragOverlay>{activeMeal ? <MealCard meal={activeMeal} overlay /> : null}</DragOverlay>
    </DndContext>
  )
}

function PlannerView({ state, weekDates, weekOffset, setWeekOffset, mealsByType, addMeal, removeMeal }: {
  state: AppState
  weekDates: Date[]
  weekOffset: number
  setWeekOffset: (n: number) => void
  mealsByType: Record<MealType, Meal[]>
  addMeal: (meal: Meal) => void
  removeMeal: (day: string, type: MealType) => void
}) {
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

      <div className="planner-layout">
        <aside className="meal-library">
          <h3>Meals</h3>
          <p className="hint">Drag a meal to a slot, or tap it to add it to the next empty slot.</p>
          {mealTypes.map((type) => (
            <div className="library-group" key={type}>
              <h4>{type}</h4>
              {mealsByType[type].map((meal) => <DraggableMeal key={meal.id} meal={meal} onTap={() => addMeal(meal)} />)}
            </div>
          ))}
        </aside>

        <div className="planner-scroll">
          <div className="planner-grid">
            <div className="corner" />
            {weekDates.map((date, i) => <div className="day-header" key={date.toISOString()}><b>{dayShort[i]}</b><span>{date.getDate()}</span></div>)}
            {mealTypes.map((type) => (
              <div className="planner-row" key={type}>
                <div className="meal-type-label">{type}</div>
                {weekDates.map((date, i) => {
                  const day = days[i]
                  const key = dateKey(date)
                  const mealId = state.planner[key]?.[type] ?? null
                  const meal = mealId ? state.meals.find((m) => m.id === mealId) : null
                  return <PlannerSlot key={key} day={key} type={type} meal={meal} onRemove={() => removeMeal(key, type)} />
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function DraggableMeal({ meal, onTap }: { meal: Meal; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `meal-${meal.id}` })
  return (
    <button
      ref={setNodeRef}
      className={`meal-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={onTap}
    >
      <span className="drag-handle">⋮⋮</span>{meal.name}
    </button>
  )
}

function MealCard({ meal, overlay = false }: { meal: Meal; overlay?: boolean }) {
  return <div className={`meal-card ${overlay ? 'overlay-card' : ''}`}><span>{meal.name}</span></div>
}

function PlannerSlot({ day, type, meal, onRemove }: { day: string; type: MealType; meal: Meal | null | undefined; onRemove: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-|${day}|${type}` })
  return (
    <div ref={setNodeRef} className={`planner-slot ${isOver ? 'over' : ''} ${meal ? 'filled' : ''}`}>
      {meal ? (
        <button className="planned-meal" title="Double click to remove" onDoubleClick={onRemove}>
          {meal.name}
        </button>
      ) : <span className="slot-placeholder">Drop here</span>}
    </div>
  )
}

function MealsView({ meals, ingredients, onNew, onEdit, onDelete, onAdd }: {
  meals: Meal[]; ingredients: Ingredient[]; onNew: () => void; onEdit: (m: Meal) => void; onDelete: (id: string) => void; onAdd: (m: Meal) => void
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
          return <div key={type} className="meal-library-section"><h3>{type}</h3>{group.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onAdd={() => onAdd(meal)} />)}</div>
        })}
      </div>
    </section>
  )
}

function MealEditorCard({ meal, ingredients, onEdit, onDelete, onAdd }: { meal: Meal; ingredients: Ingredient[]; onEdit: () => void; onDelete: () => void; onAdd: () => void }) {
  return (
    <article className="meal-detail-card">
      <div className="meal-detail-top"><h3>{meal.name}</h3><span className="pill">{meal.type}</span></div>
      <ul>{meal.ingredients.map((mi) => { const ing = ingredients.find((i) => i.id === mi.ingredientId); return ing ? <li key={mi.ingredientId}>{formatQuantity(mi.quantity)} {ing.unit} {ing.name}</li> : null })}</ul>
      <div className="card-actions"><button onClick={onAdd}>Add to planner</button><button onClick={onEdit}>Edit</button><button className="danger-text" onClick={onDelete}>Delete</button></div>
    </article>
  )
}

function MealForm({ meal, ingredients, onCancel, onSave, onCreateIngredient }: {
  meal: Meal | null | undefined; ingredients: Ingredient[]; onCancel: () => void; onSave: (meal: Meal, oldId?: string) => void; onCreateIngredient: (ingredient: Ingredient) => void
}) {
  const [name, setName] = useState(meal?.name ?? '')
  const [type, setType] = useState<MealType>(meal?.type ?? 'Dinner')
  const [rows, setRows] = useState(meal?.ingredients ?? [])
  const [newIngredient, setNewIngredient] = useState('')

  function addRow() {
    const first = ingredients[0]
    if (first) setRows([...rows, { ingredientId: first.id, quantity: 1 }])
  }
  function addNewIngredient() {
    const trimmed = newIngredient.trim()
    if (!trimmed) return
    const id = slug(trimmed)
    const ingredient = { id, name: trimmed, unit: 'each' }
    onCreateIngredient(ingredient)
    setRows([...rows, { ingredientId: id, quantity: 1 }])
    setNewIngredient('')
  }
  function save() {
    if (!name.trim() || rows.length === 0) return
    onSave({ id: meal?.id ?? crypto.randomUUID(), name: name.trim(), type, ingredients: rows }, meal?.id)
  }

  return (
    <div className="modal-backdrop"><div className="modal">
      <div className="modal-header"><h2>{meal ? 'Edit meal' : 'New meal'}</h2><button onClick={onCancel}>×</button></div>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken tacos" autoFocus /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value as MealType)}>{mealTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
      <div className="ingredients-editor"><div className="editor-label">Ingredients</div>
        {rows.map((row, index) => <div className="ingredient-row" key={`${row.ingredientId}-${index}`}>
          <select value={row.ingredientId} onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, ingredientId: e.target.value } : r))}>{ingredients.map((i) => <option value={i.id} key={i.id}>{i.name}</option>)}</select>
          <input type="number" min="0" step="0.25" value={row.quantity} onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
          <span>{ingredients.find((i) => i.id === row.ingredientId)?.unit ?? ''}</span>
          <button onClick={() => setRows(rows.filter((_, i) => i !== index))}>×</button>
        </div>)}
        <button className="secondary" onClick={addRow}>+ Add ingredient</button>
        <div className="new-ingredient"><input value={newIngredient} onChange={(e) => setNewIngredient(e.target.value)} placeholder="New ingredient" /><button onClick={addNewIngredient}>Create</button></div>
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={save}>Save meal</button></div>
    </div></div>
  )
}

function ShoppingView({ shopping, onToggle, onClearChecked, weekDates, weekOffset, setWeekOffset }: { shopping: ShoppingItem[]; onToggle: (id: string) => void; onClearChecked: () => void; weekDates: Date[]; weekOffset: number; setWeekOffset: (n: number) => void }) {
  const remaining = shopping.filter((i) => !i.checked)
  return <section>
    <div className="section-header">
      <div><div className="eyebrow">SHOPPING</div><h2>{formatRange(weekDates)}</h2></div>
      <div className="week-controls"><button onClick={() => setWeekOffset(weekOffset - 1)}>‹</button><button onClick={() => setWeekOffset(0)}>Today</button><button onClick={() => setWeekOffset(weekOffset + 1)}>›</button></div>
    </div>
    {shopping.some((x) => x.checked) && <div style={{ marginBottom: 14 }}><button className="secondary" onClick={onClearChecked}>Clear checks</button></div>}
    {shopping.length === 0 ? <div className="empty-state"><h3>No meals planned</h3><p>Add meals to your weekly planner and the shopping list will appear here.</p></div> : <>
      <p className="shopping-summary">{remaining.length} item{remaining.length === 1 ? '' : 's'} remaining</p>
      <div className="shopping-list">{shopping.map((item) => <label className={`shopping-item ${item.checked ? 'checked' : ''}`} key={item.ingredientId}><input type="checkbox" checked={item.checked} onChange={() => onToggle(item.ingredientId)} /><span className="checkmark" /><span className="shopping-name">{item.name}</span><strong>{formatQuantity(item.quantity)} {item.unit}</strong></label>)}</div>
    </>}
  </section>
}

function buildShoppingList(state: AppState, weekDates: Date[]): ShoppingItem[] {
  const totals = new Map<string, number>()
  for (const day of weekDates.map(dateKey)) {
    for (const type of mealTypes) {
      const mealId = state.planner[day]?.[type]
      if (!mealId) continue
      const meal = state.meals.find((m) => m.id === mealId) ?? null
      if (!meal) continue
      for (const item of meal.ingredients) totals.set(item.ingredientId, (totals.get(item.ingredientId) ?? 0) + item.quantity)
    }
  }
  return [...totals.entries()].map(([ingredientId, quantity]) => {
    const ingredient = state.ingredients.find((i) => i.id === ingredientId)
    if (!ingredient) return null
    return { ingredientId, name: ingredient.name, unit: ingredient.unit, quantity, checked: !!state.shoppingChecked[ingredientId] }
  }).filter((x): x is ShoppingItem => x !== null).sort((a, b) => a.name.localeCompare(b.name))
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
