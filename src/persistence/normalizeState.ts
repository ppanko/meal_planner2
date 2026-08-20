import { seedProteinCategories, seedState } from '../data'
import { normalizeRecipeUrl } from '../meals/recipeDetails'
import { ensureCatalogIngredient, findIngredientByName } from '../shopping/ingredientCatalog'
import { defaultShoppingCategories } from '../types'
import type { AppState, Ingredient, Meal, ShoppingCategory } from '../types'

const unsafeObjectKeys = new Set(['__proto__', 'prototype', 'constructor'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizePersistedValue(value: unknown, depth = 0): unknown {
  if (depth > 32) return null
  if (Array.isArray(value)) return value.map((item) => sanitizePersistedValue(item, depth + 1))
  if (!isRecord(value)) return value

  const sanitized: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [key, nestedValue] of Object.entries(value)) {
    if (unsafeObjectKeys.has(key)) continue
    sanitized[key] = sanitizePersistedValue(nestedValue, depth + 1)
  }
  return sanitized
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function cloneSeed(): AppState {
  return structuredClone(seedState)
}

function normalizeShoppingCategories(state: Partial<AppState>): {
  shoppingCategories: ShoppingCategory[]
  shoppingCategoryOrder: string[]
} {
  const defaultIds = new Set(defaultShoppingCategories.map((category) => category.id))
  const requested = (Array.isArray(state.shoppingCategories) ? state.shoppingCategories : [])
    .filter((category): category is ShoppingCategory =>
      Boolean(isRecord(category) && typeof category.id === 'string' && category.id.trim() && typeof category.name === 'string' && category.name.trim()),
    )
    .map((category) => ({ id: category.id.trim(), name: category.name.trim() }))
  const requestedById = new Map(requested.map((category) => [category.id, category]))
  const shoppingCategories = [
    ...defaultShoppingCategories.map((category) => requestedById.get(category.id) ?? { ...category }),
    ...requested.filter((category) => !defaultIds.has(category.id)),
  ]
  const validIds = new Set(shoppingCategories.map((category) => category.id))
  const seen = new Set<string>()
  const shoppingCategoryOrder: string[] = []

  for (const categoryId of Array.isArray(state.shoppingCategoryOrder) ? state.shoppingCategoryOrder : []) {
    if (typeof categoryId !== 'string') continue
    if (!validIds.has(categoryId) || seen.has(categoryId)) continue
    seen.add(categoryId)
    shoppingCategoryOrder.push(categoryId)
  }
  for (const category of shoppingCategories) {
    if (seen.has(category.id)) continue
    seen.add(category.id)
    shoppingCategoryOrder.push(category.id)
  }
  return { shoppingCategories, shoppingCategoryOrder }
}

export function normalizeState(input: Partial<AppState> | unknown): AppState {
  const sanitized = sanitizePersistedValue(input)
  const state = (isRecord(sanitized) ? sanitized : {}) as Partial<AppState>
  const seed = cloneSeed()
  const requestedProteinCategories = (Array.isArray(state.proteinCategories) ? state.proteinCategories : [])
    .filter((category) => isRecord(category)
      && typeof category.id === 'string'
      && typeof category.name === 'string'
      && typeof category.color === 'string') as AppState['proteinCategories']
  const proteinCategories = requestedProteinCategories.length ? requestedProteinCategories : seedProteinCategories
  const categoryIds = new Set(proteinCategories.map((category) => category.id))
  const { shoppingCategories, shoppingCategoryOrder } = normalizeShoppingCategories(state)
  const shoppingCategoryIds = new Set(shoppingCategories.map((category) => category.id))
  const legacyIngredientProteinById: Record<string, string | null> = { chicken: 'chicken', 'ground-beef': 'beef' }
  const requestedIngredients = (Array.isArray(state.ingredients) ? state.ingredients : seed.ingredients)
    .filter((ingredient) => isRecord(ingredient)
      && typeof ingredient.id === 'string'
      && typeof ingredient.name === 'string'
      && typeof ingredient.unit === 'string') as Ingredient[]
  let ingredients: Ingredient[] = requestedIngredients.map((ingredient) => {
    const legacyIngredient = ingredient as Ingredient & { proteinCategoryId?: string | null; shoppingCategoryId?: string | null }
    const requestedId = legacyIngredient.proteinCategoryId ?? legacyIngredientProteinById[ingredient.id] ?? null
    const requestedShoppingCategoryId = legacyIngredient.shoppingCategoryId ?? null
    return {
      ...ingredient,
      proteinCategoryId: requestedId && categoryIds.has(requestedId) ? requestedId : null,
      shoppingCategoryId: requestedShoppingCategoryId && shoppingCategoryIds.has(requestedShoppingCategoryId) ? requestedShoppingCategoryId : null,
    }
  })
  const rawManualShoppingItems = Object.fromEntries(
    Object.entries(recordOrEmpty(state.manualShoppingItems)).map(([weekKey, items]) => [weekKey,
      (Array.isArray(items) ? items : [])
        .filter((item) => isRecord(item)
          && typeof item.id === 'string'
          && typeof item.name === 'string'
          && typeof item.checked === 'boolean')
        .map((item) => ({
          ...item,
          quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : undefined,
          unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : undefined,
          shoppingCategoryId: typeof item.shoppingCategoryId === 'string' && shoppingCategoryIds.has(item.shoppingCategoryId) ? item.shoppingCategoryId : null,
        }))]),
  )
  const rawShoppingHistory = (Array.isArray(state.shoppingHistory) ? state.shoppingHistory : [])
    .filter((item) => isRecord(item)
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.lastPurchasedAt === 'string')
    .map((item) => ({
      ...item,
      shoppingCategoryId: typeof item.shoppingCategoryId === 'string' && shoppingCategoryIds.has(item.shoppingCategoryId) ? item.shoppingCategoryId : null,
    }))

  function linkCatalogItem(name: string, ingredientId: string | null | undefined, categoryId: string | null | undefined) {
    let ingredient = ingredientId
      ? ingredients.find((item) => item.id === ingredientId)
      : findIngredientByName(ingredients, name)

    if (!ingredient) {
      const result = ensureCatalogIngredient(ingredients, name, categoryId ?? null)
      ingredients = result.ingredients
      ingredient = result.ingredient
    } else if (!ingredient.shoppingCategoryId && categoryId) {
      const categorizedIngredient = { ...ingredient, shoppingCategoryId: categoryId }
      ingredients = ingredients.map((item) => item.id === categorizedIngredient.id ? categorizedIngredient : item)
      ingredient = categorizedIngredient
    }

    return ingredient
  }

  for (const items of Object.values(rawManualShoppingItems)) {
    for (const item of items) linkCatalogItem(item.name, item.ingredientId, item.shoppingCategoryId)
  }
  for (const item of rawShoppingHistory) {
    linkCatalogItem(item.name, item.ingredientId, item.shoppingCategoryId)
  }
  const legacyProteinToId: Record<string, string> = {
    Chicken: 'chicken', Beef: 'beef', Seafood: 'seafood', Pork: 'pork', None: 'none', Lamb: 'lamb',
  }
  const ingredientProteinById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.proteinCategoryId]))
  const planner: AppState['planner'] = {}

  for (const [day, rows] of Object.entries(recordOrEmpty(state.planner))) {
    planner[day] = {}
    for (const [rowId, value] of Object.entries(recordOrEmpty(rows))) {
      if (Array.isArray(value)) {
        planner[day][rowId] = value.filter((mealId): mealId is string => typeof mealId === 'string').slice(0, 3)
      } else if (typeof value === 'string' && value) {
        planner[day][rowId] = [value]
      } else {
        planner[day][rowId] = []
      }
    }
  }

  const requestedMeals = (Array.isArray(state.meals) ? state.meals : seed.meals)
    .filter((meal) => isRecord(meal)
      && typeof meal.id === 'string'
      && typeof meal.name === 'string'
      && typeof meal.type === 'string') as Meal[]
  const meals = requestedMeals.map((meal) => {
    const legacyMeal = meal as Meal & { protein?: string; proteinCategoryId?: string; proteinCategoryOverrideId?: string | null }
    const explicitOverride = legacyMeal.proteinCategoryOverrideId ?? legacyMeal.proteinCategoryId ?? (legacyMeal.protein ? legacyProteinToId[legacyMeal.protein] : undefined)
    const mealIngredients = (Array.isArray(meal.ingredients) ? meal.ingredients : [])
      .filter((item) => isRecord(item)
        && typeof item.ingredientId === 'string'
        && typeof item.quantity === 'number'
        && Number.isFinite(item.quantity)) as Meal['ingredients']
    const derivedProteinIds = new Set(mealIngredients.map((item) => ingredientProteinById.get(item.ingredientId)).filter((id): id is string => Boolean(id)))
    const migratedOverride = explicitOverride === 'none' && derivedProteinIds.size > 0
      ? null
      : explicitOverride && categoryIds.has(explicitOverride) ? explicitOverride : null
    return {
      ...meal,
      ingredients: mealIngredients,
      proteinCategoryOverrideId: migratedOverride,
      recipeUrl: normalizeRecipeUrl(typeof meal.recipeUrl === 'string' ? meal.recipeUrl : '') ?? '',
      notes: typeof meal.notes === 'string' ? meal.notes.trim() : '',
      instructions: Array.isArray(meal.instructions)
        ? meal.instructions.filter((step): step is string => typeof step === 'string').map((step) => step.trim()).filter(Boolean)
        : [],
    }
  })
  const manualShoppingItems = Object.fromEntries(
    Object.entries(rawManualShoppingItems).map(([weekKey, items]) => [weekKey, items.map((item) => {
      const ingredient = linkCatalogItem(item.name, item.ingredientId, item.shoppingCategoryId)
      return {
        ...item,
        ingredientId: ingredient.id,
        shoppingCategoryId: ingredient.shoppingCategoryId ?? null,
      }
    })]),
  )
  const shoppingHistory = rawShoppingHistory.map((item) => {
    const ingredient = linkCatalogItem(item.name, item.ingredientId, item.shoppingCategoryId)
    return {
      ...item,
      ingredientId: ingredient.id,
      shoppingCategoryId: ingredient.shoppingCategoryId ?? null,
    }
  })

  return {
    ingredients,
    meals,
    planner,
    shoppingChecked: recordOrEmpty(state.shoppingChecked) as AppState['shoppingChecked'],
    manualShoppingItems,
    proteinCategories,
    plannerRowsByWeek: recordOrEmpty(state.plannerRowsByWeek) as AppState['plannerRowsByWeek'],
    shoppingHistory,
    plannerNotes: recordOrEmpty(state.plannerNotes) as AppState['plannerNotes'],
    shoppingPurchasesByWeek: recordOrEmpty(state.shoppingPurchasesByWeek) as AppState['shoppingPurchasesByWeek'],
    shoppingDismissedByWeek: recordOrEmpty(state.shoppingDismissedByWeek) as AppState['shoppingDismissedByWeek'],
    shoppingCategories,
    shoppingCategoryOrder,
  }
}
