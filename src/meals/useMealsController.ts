import { useState } from 'react'
import type { AppState, Ingredient, Meal, Planner, ProteinCategory } from '../types'

type View = 'planner' | 'meals' | 'shopping'

type MealsControllerOptions = {
  state: AppState | null
  setView: (view: View) => void
  update: (next: AppState) => void
  updateWithUndo: (next: AppState, message: string) => void
}

export function useMealsController({ state, setView, update, updateWithUndo }: MealsControllerOptions) {
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [showMealForm, setShowMealForm] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState(false)

  function openNewMeal() {
    setDuplicateMode(false)
    setEditingMeal(null)
    setShowMealForm(true)
  }

  function openEditMeal(meal: Meal) {
    setDuplicateMode(false)
    setEditingMeal(meal)
    setShowMealForm(true)
  }

  function closeMealForm() {
    setDuplicateMode(false)
    setEditingMeal(null)
    setShowMealForm(false)
  }

  function saveMeal(meal: Meal, oldId?: string) {
    if (!state) return
    const meals = oldId
      ? state.meals.map((candidate) => candidate.id === oldId ? meal : candidate)
      : [...state.meals, meal]
    update({ ...state, meals })
    closeMealForm()
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

    const deletedMeal = state.meals.find((meal) => meal.id === mealId)
    updateWithUndo({
      ...state,
      meals: state.meals.filter((meal) => meal.id !== mealId),
      planner,
    }, deletedMeal ? `Deleted ${deletedMeal.name}` : 'Deleted meal')
  }

  function createIngredient(ingredient: Ingredient) {
    if (!state) return
    update({ ...state, ingredients: [...state.ingredients, ingredient] })
  }

  function deleteIngredient(ingredientId: string) {
    if (!state) return

    const ingredient = state.ingredients.find((item) => item.id === ingredientId)
    if (!ingredient) return

    const isUsed = state.meals.some((meal) =>
      meal.ingredients.some((item) => item.ingredientId === ingredientId),
    )
    if (isUsed) return

    const shoppingPurchasesByWeek: AppState['shoppingPurchasesByWeek'] = JSON.parse(
      JSON.stringify(state.shoppingPurchasesByWeek),
    )
    for (const purchases of Object.values(shoppingPurchasesByWeek)) {
      delete purchases[ingredientId]
    }

    updateWithUndo({
      ...state,
      ingredients: state.ingredients.filter((item) => item.id !== ingredientId),
      shoppingPurchasesByWeek,
    }, `Deleted ingredient ${ingredient.name}`)
  }

  function createProteinCategory(category: ProteinCategory) {
    if (!state) return
    update({ ...state, proteinCategories: [...state.proteinCategories, category] })
  }

  function deleteProteinCategory(categoryId: string) {
    if (!state || categoryId === 'none') return

    const category = state.proteinCategories.find((item) => item.id === categoryId)
    if (!category) return

    const isUsedByIngredient = state.ingredients.some(
      (ingredient) => ingredient.proteinCategoryId === categoryId,
    )
    const isUsedByMeal = state.meals.some(
      (meal) => meal.proteinCategoryOverrideId === categoryId,
    )
    if (isUsedByIngredient || isUsedByMeal) return

    updateWithUndo({
      ...state,
      proteinCategories: state.proteinCategories.filter((item) => item.id !== categoryId),
    }, `Deleted protein category ${category.name}`)
  }

  return {
    editingMeal,
    showMealForm,
    duplicateMode,
    openNewMeal,
    openEditMeal,
    closeMealForm,
    saveMeal,
    duplicateMeal,
    deleteMeal,
    createIngredient,
    deleteIngredient,
    createProteinCategory,
    deleteProteinCategory,
  }
}
