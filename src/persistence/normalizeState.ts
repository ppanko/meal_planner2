import { seedProteinCategories, seedState } from '../data'
import { normalizeRecipeUrl } from '../meals/recipeDetails'
import { ensureCatalogIngredient, findIngredientByName } from '../shopping/ingredientCatalog'
import { defaultShoppingCategories } from '../types'
import type { AppState, Ingredient, Meal, ShoppingCategory } from '../types'

function cloneSeed(): AppState {
  return structuredClone(seedState)
}

function normalizeShoppingCategories(state: Partial<AppState>): {
  shoppingCategories: ShoppingCategory[]
  shoppingCategoryOrder: string[]
} {
  const defaultIds = new Set(defaultShoppingCategories.map((category) => category.id))
  const requested = (state.shoppingCategories ?? [])
    .filter((category): category is ShoppingCategory =>
      Boolean(category && typeof category.id === 'string' && category.id.trim() && typeof category.name === 'string' && category.name.trim()),
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

  for (const categoryId of state.shoppingCategoryOrder ?? []) {
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

export function normalizeState(state: Partial<AppState>): AppState {
  const seed = cloneSeed()
  const proteinCategories = state.proteinCategories?.length ? state.proteinCategories : seedProteinCategories
  const categoryIds = new Set(proteinCategories.map((category) => category.id))
  const { shoppingCategories, shoppingCategoryOrder } = normalizeShoppingCategories(state)
  const shoppingCategoryIds = new Set(shoppingCategories.map((category) => category.id))
  const legacyIngredientProteinById: Record<string, string | null> = { chicken: 'chicken', 'ground-beef': 'beef' }
  let ingredients: Ingredient[] = (state.ingredients ?? seed.ingredients).map((ingredient) => {
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
    Object.entries(state.manualShoppingItems ?? {}).map(([weekKey, items]) => [weekKey, items.map((item) => ({
      ...item,
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : undefined,
      unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : undefined,
      shoppingCategoryId: item.shoppingCategoryId && shoppingCategoryIds.has(item.shoppingCategoryId) ? item.shoppingCategoryId : null,
    }))]),
  )
  const rawShoppingHistory = (state.shoppingHistory ?? []).map((item) => ({
    ...item,
    shoppingCategoryId: item.shoppingCategoryId && shoppingCategoryIds.has(item.shoppingCategoryId) ? item.shoppingCategoryId : null,
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

  for (const [day, rows] of Object.entries(state.planner ?? {})) {
    planner[day] = {}
    for (const [rowId, value] of Object.entries(rows)) {
      if (Array.isArray(value)) {
        planner[day][rowId] = value.filter((mealId): mealId is string => typeof mealId === 'string').slice(0, 3)
      } else if (typeof value === 'string' && value) {
        planner[day][rowId] = [value]
      } else {
        planner[day][rowId] = []
      }
    }
  }

  const meals = (state.meals ?? seed.meals).map((meal) => {
    const legacyMeal = meal as Meal & { protein?: string; proteinCategoryId?: string; proteinCategoryOverrideId?: string | null }
    const explicitOverride = legacyMeal.proteinCategoryOverrideId ?? legacyMeal.proteinCategoryId ?? (legacyMeal.protein ? legacyProteinToId[legacyMeal.protein] : undefined)
    const derivedProteinIds = new Set(meal.ingredients.map((item) => ingredientProteinById.get(item.ingredientId)).filter((id): id is string => Boolean(id)))
    const migratedOverride = explicitOverride === 'none' && derivedProteinIds.size > 0
      ? null
      : explicitOverride && categoryIds.has(explicitOverride) ? explicitOverride : null
    return {
      ...meal,
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
    shoppingChecked: state.shoppingChecked ?? {},
    manualShoppingItems,
    proteinCategories,
    plannerRowsByWeek: state.plannerRowsByWeek ?? {},
    shoppingHistory,
    plannerNotes: state.plannerNotes ?? {},
    shoppingPurchasesByWeek: state.shoppingPurchasesByWeek ?? {},
    shoppingDismissedByWeek: state.shoppingDismissedByWeek ?? {},
    shoppingCategories,
    shoppingCategoryOrder,
  }
}
