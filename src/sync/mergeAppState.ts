import type { AppState, Meal } from '../types'
import { clone } from '../utils/clone'

type ConflictPreference = 'local' | 'remote'

type MergeResult<T> = {
  value: T
  conflicts: string[]
}

const missing = Symbol('missing')
type Missing = typeof missing

function equal(left: unknown | Missing, right: unknown | Missing): boolean {
  if (left === missing || right === missing) return left === right
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equal(value, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
  }
  return false
}

function isRecord(value: unknown | Missing): value is Record<string, unknown> {
  return value !== missing && value !== null && typeof value === 'object' && !Array.isArray(value)
}

function arrayKey(value: unknown): string | null {
  if (!isRecord(value)) return null
  if (typeof value.id === 'string') return value.id
  if (typeof value.ingredientId === 'string') return value.ingredientId
  return null
}

function isKeyedArray(value: unknown[]): boolean {
  if (value.length === 0) return true
  const keys = value.map(arrayKey)
  return keys.every((key): key is string => key !== null) && new Set(keys).size === keys.length
}

function mergePlannerSlot(base: unknown[], local: unknown[], remote: unknown[]) {
  if (![...base, ...local, ...remote].every((value) => typeof value === 'string')) return null

  const values = [...new Set([...base, ...remote, ...local] as string[])]
  const count = (items: unknown[], value: string) => items.filter((item) => item === value).length
  const finalCounts = new Map(values.map((value) => [
    value,
    count(base, value) + (count(local, value) - count(base, value)) + (count(remote, value) - count(base, value)),
  ]))
  if ([...finalCounts.values()].some((quantity) => quantity < 0)) return null
  if ([...finalCounts.values()].reduce((sum, quantity) => sum + quantity, 0) > 3) return null

  const merged: string[] = []
  for (const value of [...remote, ...local] as string[]) {
    const needed = finalCounts.get(value) ?? 0
    if (merged.filter((item) => item === value).length < needed) merged.push(value)
  }
  return merged
}

function mergeKeyedArray(
  base: unknown[],
  local: unknown[],
  remote: unknown[],
  path: string,
  preference: ConflictPreference,
): MergeResult<unknown[]> {
  const baseByKey = new Map(base.map((value) => [arrayKey(value)!, value]))
  const localByKey = new Map(local.map((value) => [arrayKey(value)!, value]))
  const remoteByKey = new Map(remote.map((value) => [arrayKey(value)!, value]))
  const orderedKeys = [...new Set([
    ...remote.map((value) => arrayKey(value)!),
    ...local.map((value) => arrayKey(value)!),
    ...base.map((value) => arrayKey(value)!),
  ])]
  const values: unknown[] = []
  const conflicts: string[] = []

  for (const key of orderedKeys) {
    const result = mergeValue(
      baseByKey.has(key) ? baseByKey.get(key) : missing,
      localByKey.has(key) ? localByKey.get(key) : missing,
      remoteByKey.has(key) ? remoteByKey.get(key) : missing,
      `${path}[${key}]`,
      preference,
    )
    conflicts.push(...result.conflicts)
    if (result.value !== missing) values.push(result.value)
  }

  return { value: values, conflicts }
}

function mergeValue(
  base: unknown | Missing,
  local: unknown | Missing,
  remote: unknown | Missing,
  path: string,
  preference: ConflictPreference,
): MergeResult<unknown | Missing> {
  if (equal(local, remote)) return { value: local === missing ? missing : clone(local), conflicts: [] }
  if (equal(base, local)) return { value: remote === missing ? missing : clone(remote), conflicts: [] }
  if (equal(base, remote)) return { value: local === missing ? missing : clone(local), conflicts: [] }

  if (isRecord(local) && isRecord(remote) && (base === missing || isRecord(base))) {
    const baseRecord = base === missing ? {} : base
    const keys = new Set([...Object.keys(baseRecord), ...Object.keys(local), ...Object.keys(remote)])
    const value: Record<string, unknown> = {}
    const conflicts: string[] = []

    for (const key of keys) {
      const result = mergeValue(
        Object.hasOwn(baseRecord, key) ? baseRecord[key] : missing,
        Object.hasOwn(local, key) ? local[key] : missing,
        Object.hasOwn(remote, key) ? remote[key] : missing,
        path ? `${path}.${key}` : key,
        preference,
      )
      conflicts.push(...result.conflicts)
      if (result.value !== missing) value[key] = result.value
    }

    return { value, conflicts }
  }

  if (Array.isArray(local) && Array.isArray(remote) && (base === missing || Array.isArray(base))) {
    const baseArray = base === missing ? [] : base
    if (isKeyedArray(baseArray) && isKeyedArray(local) && isKeyedArray(remote)) {
      return mergeKeyedArray(baseArray, local, remote, path, preference)
    }
    if (path.startsWith('planner.')) {
      const plannerSlot = mergePlannerSlot(baseArray, local, remote)
      if (plannerSlot) return { value: plannerSlot, conflicts: [] }
    }
  }

  return {
    value: preference === 'local'
      ? local === missing ? missing : clone(local)
      : remote === missing ? missing : clone(remote),
    conflicts: [path || 'state'],
  }
}

export function mergeAppStates(
  base: AppState,
  local: AppState,
  remote: AppState,
  preference: ConflictPreference = 'local',
): { state: AppState; conflicts: string[] } {
  const result = mergeValue(base, local, remote, '', preference)
  const state = result.value as AppState
  const conflicts = [...result.conflicts]
  const preferred = preference === 'local' ? local : remote

  const referencedMealIds = new Set(
    Object.values(state.planner).flatMap((day) => Object.values(day).flat()),
  )
  const mealIds = new Set(state.meals.map((meal) => meal.id))
  for (const mealId of referencedMealIds) {
    if (mealIds.has(mealId)) continue
    const preferredMeal = preferred.meals.find((meal) => meal.id === mealId)
    const referenceConflict = local.meals.some((meal) => meal.id === mealId)
      !== remote.meals.some((meal) => meal.id === mealId)
    if (referenceConflict) conflicts.push(`meals[${mealId}]`)
    if (preferredMeal) {
      state.meals.push(clone(preferredMeal))
      mealIds.add(mealId)
    } else {
      for (const day of Object.values(state.planner)) {
        for (const [rowId, plannedMealIds] of Object.entries(day)) {
          day[rowId] = plannedMealIds.filter((id) => id !== mealId)
        }
      }
    }
  }

  const ingredientIds = new Set(state.ingredients.map((ingredient) => ingredient.id))
  const referencedIngredientIds = new Set(
    state.meals.flatMap((meal) => meal.ingredients.map((ingredient) => ingredient.ingredientId)),
  )
  for (const ingredientId of referencedIngredientIds) {
    if (ingredientIds.has(ingredientId)) continue
    const preferredIngredient = preferred.ingredients.find((ingredient) => ingredient.id === ingredientId)
    const referenceConflict = local.ingredients.some((ingredient) => ingredient.id === ingredientId)
      !== remote.ingredients.some((ingredient) => ingredient.id === ingredientId)
    if (referenceConflict) conflicts.push(`ingredients[${ingredientId}]`)
    if (preferredIngredient) {
      state.ingredients.push(clone(preferredIngredient))
      ingredientIds.add(ingredientId)
    } else {
      state.meals = state.meals.map((meal) => ({
        ...meal,
        ingredients: meal.ingredients.filter((ingredient) => ingredient.ingredientId !== ingredientId),
      }))
    }
  }

  const hadShoppingCategories = state.shoppingCategories !== undefined
  const shoppingCategories = state.shoppingCategories ?? []
  const shoppingCategoryIds = new Set(shoppingCategories.map((category) => category.id))
  const referencedShoppingCategoryIds = new Set([
    ...state.ingredients.map((ingredient) => ingredient.shoppingCategoryId),
    ...Object.values(state.manualShoppingItems).flat().map((item) => item.shoppingCategoryId),
    ...state.shoppingHistory.map((item) => item.shoppingCategoryId),
  ].filter((id): id is string => Boolean(id)))
  for (const categoryId of referencedShoppingCategoryIds) {
    if (shoppingCategoryIds.has(categoryId)) continue
    const preferredCategory = preferred.shoppingCategories?.find((category) => category.id === categoryId)
    const referenceConflict = Boolean(local.shoppingCategories?.some((category) => category.id === categoryId))
      !== Boolean(remote.shoppingCategories?.some((category) => category.id === categoryId))
    if (referenceConflict) conflicts.push(`shoppingCategories[${categoryId}]`)
    if (preferredCategory) {
      shoppingCategories.push(clone(preferredCategory))
      shoppingCategoryIds.add(categoryId)
      if (!state.shoppingCategoryOrder?.includes(categoryId)) {
        state.shoppingCategoryOrder = [...(state.shoppingCategoryOrder ?? []), categoryId]
      }
    } else {
      state.ingredients = state.ingredients.map((ingredient) =>
        ingredient.shoppingCategoryId === categoryId
          ? { ...ingredient, shoppingCategoryId: null }
          : ingredient)
      state.manualShoppingItems = Object.fromEntries(
        Object.entries(state.manualShoppingItems).map(([weekKey, items]) => [
          weekKey,
          items.map((item) => item.shoppingCategoryId === categoryId
            ? { ...item, shoppingCategoryId: null }
            : item),
        ]),
      )
      state.shoppingHistory = state.shoppingHistory.map((item) =>
        item.shoppingCategoryId === categoryId ? { ...item, shoppingCategoryId: null } : item)
      state.shoppingCategoryOrder = state.shoppingCategoryOrder?.filter((id) => id !== categoryId)
    }
  }
  if (hadShoppingCategories || shoppingCategories.length > 0) state.shoppingCategories = shoppingCategories

  const proteinCategoryIds = new Set(state.proteinCategories.map((category) => category.id))
  const referencedProteinCategoryIds = new Set([
    ...state.ingredients.map((ingredient) => ingredient.proteinCategoryId),
    ...state.meals.map((meal) => meal.proteinCategoryOverrideId),
  ].filter((id): id is string => Boolean(id)))
  for (const categoryId of referencedProteinCategoryIds) {
    if (proteinCategoryIds.has(categoryId)) continue
    const preferredCategory = preferred.proteinCategories.find((category) => category.id === categoryId)
    const referenceConflict = local.proteinCategories.some((category) => category.id === categoryId)
      !== remote.proteinCategories.some((category) => category.id === categoryId)
    if (referenceConflict) conflicts.push(`proteinCategories[${categoryId}]`)
    if (preferredCategory) {
      state.proteinCategories.push(clone(preferredCategory))
      proteinCategoryIds.add(categoryId)
    } else {
      state.ingredients = state.ingredients.map((ingredient) =>
        ingredient.proteinCategoryId === categoryId
          ? { ...ingredient, proteinCategoryId: null }
          : ingredient)
      state.meals = state.meals.map((meal) =>
        meal.proteinCategoryOverrideId === categoryId
          ? { ...meal, proteinCategoryOverrideId: null }
          : meal)
    }
  }

  return {
    state,
    conflicts: [...new Set(conflicts)],
  }
}

export function appStatesEqual(left: AppState, right: AppState) {
  return equal(left, right)
}

export function conflictingMealId(paths: string[]): string | null {
  const matches = paths.map((path) => path.match(/^meals\[([^\]]+)]/))
  if (matches.some((match) => !match)) return null
  const ids = new Set(matches.map((match) => match![1]))
  return ids.size === 1 ? [...ids][0]! : null
}

export function addConflictingMealCopy(state: AppState, source: AppState, mealId: string): AppState {
  const meal = source.meals.find((item) => item.id === mealId)
  if (!meal) return state

  const copy: Meal = {
    ...clone(meal),
    id: crypto.randomUUID(),
    name: `${meal.name} Copy`,
  }
  return { ...state, meals: [...state.meals, copy] }
}
