import { mealTypes } from '../data'
import type { AppState, Ingredient, Meal, Planner, PlannerRow, ProteinCategory } from '../types'
import { getMealProteinCategories } from '../meals/mealProtein'
import { dateKey } from '../utils/dates'
import { sortBySearch } from '../utils/search'

export const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const defaultPlannerRows: PlannerRow[] = mealTypes.map((type) => ({ id: type, label: type }))

export function getPlannerRows(state: AppState, weekDates: Date[]): PlannerRow[] {
  const weekKey = dateKey(weekDates[0])
  return [...defaultPlannerRows, ...(state.plannerRowsByWeek[weekKey] ?? [])]
}

export function getSlotMealIds(planner: Planner, day: string, rowId: string): string[] {
  return planner[day]?.[rowId] ?? []
}

export function filterMeals(
  meals: Meal[],
  ingredients: Ingredient[],
  proteinCategories: ProteinCategory[],
  search: string,
  proteinFilter: string | 'All',
) {
  return sortBySearch(meals, search, (meal) => meal.name)
    .filter((meal) => {
      if (proteinFilter === 'All') return true
      const categories = getMealProteinCategories(meal, ingredients, proteinCategories)
      if (categories.length === 0) return proteinFilter === 'none'
      return categories.some((category) => category.id === proteinFilter)
    })
}
