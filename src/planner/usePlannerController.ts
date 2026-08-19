import { useMemo, useState } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { AppView } from '../appTypes'
import type { AppState, Meal, Planner, PlannerRow } from '../types'
import { clone } from '../utils/clone'
import { dateKey, formatRange, getWeekDates, getWeekDatesForDateKey } from '../utils/dates'
import { getPlannerRows } from './plannerUtils'

type PlannerControllerOptions = {
  state: AppState | null
  weekOffset: number
  weekDates: Date[]
  setView: (view: AppView) => void
  update: (next: AppState) => void
  updateWithUndo: (next: AppState, message: string) => void
}

export function usePlannerController({
  state,
  weekOffset,
  weekDates,
  setView,
  update,
  updateWithUndo,
}: PlannerControllerOptions) {
  const [activeMealId, setActiveMealId] = useState<string | null>(null)
  const [showCopyWeek, setShowCopyWeek] = useState(false)
  const [copySourceWeekKey, setCopySourceWeekKey] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const shoppingWeekKey = dateKey(weekDates[0])
  const activeMeal = activeMealId && state
    ? state.meals.find((meal) => meal.id === activeMealId) ?? null
    : null

  const copyableWeekKeys = useMemo(() => {
    if (!state) return []

    const keys = new Set<string>()

    for (const [dayKey, dayPlan] of Object.entries(state.planner)) {
      if (Object.values(dayPlan ?? {}).some((mealIds) => (mealIds?.length ?? 0) > 0)) {
        keys.add(dateKey(getWeekDatesForDateKey(dayKey)[0]))
      }
    }

    for (const [dayKey, dayNotes] of Object.entries(state.plannerNotes)) {
      if (Object.keys(dayNotes ?? {}).length > 0) {
        keys.add(dateKey(getWeekDatesForDateKey(dayKey)[0]))
      }
    }

    for (const [weekKey, rows] of Object.entries(state.plannerRowsByWeek)) {
      if ((rows?.length ?? 0) > 0) {
        keys.add(dateKey(getWeekDatesForDateKey(weekKey)[0]))
      }
    }

    keys.delete(shoppingWeekKey)
    return [...keys].sort((a, b) => b.localeCompare(a))
  }, [state, shoppingWeekKey])

  function openCopyWeek() {
    const previousWeekKey = dateKey(getWeekDates(weekOffset - 1)[0])
    const preferredSource = copyableWeekKeys.includes(previousWeekKey)
      ? previousWeekKey
      : copyableWeekKeys[0] ?? ''

    setCopySourceWeekKey(preferredSource)
    setShowCopyWeek(true)
  }

  function closeCopyWeek() {
    setShowCopyWeek(false)
    setCopySourceWeekKey('')
  }

  function copyWeek(sourceWeekKey: string) {
    if (!state || !sourceWeekKey) return

    const sourceWeekDates = getWeekDatesForDateKey(sourceWeekKey)
    const targetWeekDates = getWeekDates(weekOffset)
    const normalizedSourceWeekKey = dateKey(sourceWeekDates[0])
    const targetWeekKey = dateKey(targetWeekDates[0])

    if (normalizedSourceWeekKey === targetWeekKey) return

    const sourceCustomRows = state.plannerRowsByWeek[normalizedSourceWeekKey] ?? []
    const customRowIdMap = new Map<string, string>()
    const copiedCustomRows = sourceCustomRows.map((row) => {
      const id = `custom-${crypto.randomUUID()}`
      customRowIdMap.set(row.id, id)
      return { ...row, id }
    })

    const remapRowId = (rowId: string) => customRowIdMap.get(rowId) ?? rowId
    const planner = clone(state.planner)
    const plannerNotes = clone(state.plannerNotes)

    for (let i = 0; i < 7; i += 1) {
      const sourceDayKey = dateKey(sourceWeekDates[i])
      const targetDayKey = dateKey(targetWeekDates[i])
      const sourceDayPlan = state.planner[sourceDayKey] ?? {}
      const sourceDayNotes = state.plannerNotes[sourceDayKey] ?? {}

      delete planner[targetDayKey]
      delete plannerNotes[targetDayKey]

      const copiedDayPlan: Record<string, string[]> = {}
      for (const [rowId, mealIds] of Object.entries(sourceDayPlan)) {
        if ((mealIds?.length ?? 0) > 0) {
          copiedDayPlan[remapRowId(rowId)] = [...mealIds]
        }
      }

      if (Object.keys(copiedDayPlan).length > 0) {
        planner[targetDayKey] = copiedDayPlan
      }

      const copiedDayNotes: Record<string, string> = {}
      for (const [rowId, note] of Object.entries(sourceDayNotes)) {
        if (note) {
          copiedDayNotes[remapRowId(rowId)] = note
        }
      }

      if (Object.keys(copiedDayNotes).length > 0) {
        plannerNotes[targetDayKey] = copiedDayNotes
      }
    }

    const plannerRowsByWeek = { ...state.plannerRowsByWeek }
    if (copiedCustomRows.length > 0) {
      plannerRowsByWeek[targetWeekKey] = copiedCustomRows
    } else {
      delete plannerRowsByWeek[targetWeekKey]
    }

    const shoppingPurchasesByWeek = { ...state.shoppingPurchasesByWeek }
    delete shoppingPurchasesByWeek[targetWeekKey]
    const shoppingDismissedByWeek = { ...state.shoppingDismissedByWeek }
    delete shoppingDismissedByWeek[targetWeekKey]

    updateWithUndo(
      {
        ...state,
        planner,
        plannerNotes,
        plannerRowsByWeek,
        shoppingPurchasesByWeek,
        shoppingDismissedByWeek,
      },
      `Copied ${formatRange(sourceWeekDates)}`,
    )

    closeCopyWeek()
  }

  function handleDragStart(event: { active: { id: string | number } }) {
    setActiveMealId(String(event.active.id).replace('meal-', ''))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveMealId(null)

    if (!event.over || !state) return

    const mealId = String(event.active.id).replace(/^meal-/, '')
    const targetId = String(event.over.id)
    if (!targetId.startsWith('slot:')) return

    const [, day, rowId] = targetId.split(':')
    if (!day || !rowId) return

    const meal = state.meals.find((candidate) => candidate.id === mealId)
    if (!meal) return

    const weekDatesForDay = getWeekDatesForDateKey(day)
    const validRowIds = new Set(getPlannerRows(state, weekDatesForDay).map((row) => row.id))
    if (!validRowIds.has(rowId)) return

    const planner: Planner = clone(state.planner)
    planner[day] ??= {}

    const current = planner[day][rowId] ?? []
    if (current.length >= 3) return

    planner[day][rowId] = [...current, meal.id]
    update({ ...state, planner })
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
      if (Object.keys(dayNotes).length > 0) plannerNotes[day] = dayNotes
      else delete plannerNotes[day]
    }

    update({ ...state, plannerNotes })
  }

  function removeMeal(day: string, rowId: string, mealId: string) {
    if (!state) return

    const planner: Planner = clone(state.planner)
    const current = planner[day]?.[rowId] ?? []
    const next = current.filter((id) => id !== mealId)

    if (planner[day]) planner[day][rowId] = next

    const plannerNotes = { ...state.plannerNotes }
    if (next.length === 0 && plannerNotes[day]) {
      const dayNotes = { ...plannerNotes[day] }
      delete dayNotes[rowId]
      if (Object.keys(dayNotes).length > 0) plannerNotes[day] = dayNotes
      else delete plannerNotes[day]
    }

    updateWithUndo({ ...state, planner, plannerNotes }, 'Removed planned meal')
  }

  function addMealToSlot(day: string, rowId: string, meal: Meal) {
    if (!state) return

    const planner: Planner = clone(state.planner)
    planner[day] ??= {}

    const current = planner[day][rowId] ?? []
    if (current.length >= 3) return

    planner[day][rowId] = [...current, meal.id]
    update({ ...state, planner })
  }

  function addMeal(meal: Meal) {
    if (!state) return

    const planner: Planner = clone(state.planner)
    const currentWeekKeys = weekDates.map(dateKey)
    const rows = getPlannerRows(state, weekDates)

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

    const weekKey = dateKey(weekDates[0])
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

    const weekKey = dateKey(weekDates[0])
    const rows = state.plannerRowsByWeek[weekKey] ?? []
    const row = rows.find((item) => item.id === rowId)
    if (!row) return

    const hasMeals = weekDates.some((date) => (state.planner[dateKey(date)]?.[rowId]?.length ?? 0) > 0)
    if (hasMeals && !confirm(`Remove "${row.label}" and its planned meals from this week?`)) return

    const planner: Planner = clone(state.planner)
    const plannerNotes = { ...state.plannerNotes }

    for (const date of weekDates) {
      const dayKey = dateKey(date)
      if (planner[dayKey]) delete planner[dayKey][rowId]

      if (plannerNotes[dayKey]) {
        const dayNotes = { ...plannerNotes[dayKey] }
        delete dayNotes[rowId]
        if (Object.keys(dayNotes).length > 0) plannerNotes[dayKey] = dayNotes
        else delete plannerNotes[dayKey]
      }
    }

    const nextRows = rows.filter((item) => item.id !== rowId)
    const plannerRowsByWeek = { ...state.plannerRowsByWeek }
    if (nextRows.length > 0) plannerRowsByWeek[weekKey] = nextRows
    else delete plannerRowsByWeek[weekKey]

    updateWithUndo({
      ...state,
      planner,
      plannerRowsByWeek,
      plannerNotes,
    }, `Removed ${row.label} row`)
  }

  function clearWeek() {
    if (!state) return

    const weekKeys = weekDates.map(dateKey)
    const planner: Planner = clone(state.planner)
    const plannerNotes = { ...state.plannerNotes }

    for (const dayKey of weekKeys) {
      delete planner[dayKey]
      delete plannerNotes[dayKey]
    }

    if (!confirm(`Clear all planned meals for ${formatRange(weekDates)}?`)) return

    const weekKey = dateKey(weekDates[0])
    const plannerRowsByWeek = { ...state.plannerRowsByWeek }
    delete plannerRowsByWeek[weekKey]
    const shoppingDismissedByWeek = { ...state.shoppingDismissedByWeek }
    delete shoppingDismissedByWeek[weekKey]

    updateWithUndo({
      ...state,
      planner,
      plannerRowsByWeek,
      plannerNotes,
      shoppingDismissedByWeek,
    }, `Cleared ${formatRange(weekDates)}`)
  }

  return {
    sensors,
    activeMeal,
    showCopyWeek,
    setShowCopyWeek,
    copySourceWeekKey,
    setCopySourceWeekKey,
    copyableWeekKeys,
    openCopyWeek,
    closeCopyWeek,
    copyWeek,
    handleDragStart,
    handleDragEnd,
    updatePlannerNote,
    removeMeal,
    addMealToSlot,
    addMeal,
    addPlannerRow,
    removePlannerRow,
    clearWeek,
  }
}
