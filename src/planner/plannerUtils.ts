import { mealTypes } from '../data'
import type { AppState, Planner, PlannerRow } from '../types'
import { dateKey } from '../utils/dates'

export const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const defaultPlannerRows: PlannerRow[] = mealTypes.map((type) => ({ id: type, label: type }))

export function getPlannerRows(state: AppState, weekDates: Date[]): PlannerRow[] {
  const weekKey = dateKey(weekDates[0])
  return [...defaultPlannerRows, ...(state.plannerRowsByWeek[weekKey] ?? [])]
}

export function getSlotMealIds(planner: Planner, day: string, rowId: string): string[] {
  return planner[day]?.[rowId] ?? []
}
