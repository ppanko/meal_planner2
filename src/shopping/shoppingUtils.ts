import { defaultShoppingCategories } from '../types'
import type { AppState, ShoppingCategory, ShoppingHistoryItem, ShoppingItem } from '../types'
import { dateKey } from '../utils/dates'

export const defaultShoppingCategoryIds = new Set(defaultShoppingCategories.map((category) => category.id))

export function getOrderedShoppingCategories(
  state: Pick<AppState, 'shoppingCategories' | 'shoppingCategoryOrder'>,
): ShoppingCategory[] {
  const categories = state.shoppingCategories && state.shoppingCategories.length > 0
    ? state.shoppingCategories
    : defaultShoppingCategories
  const byId = new Map(categories.map((category) => [category.id, category]))
  const requestedOrder = state.shoppingCategoryOrder ?? defaultShoppingCategories.map((category) => category.id)
  const ordered: ShoppingCategory[] = []
  const seen = new Set<string>()

  for (const id of requestedOrder) {
    const category = byId.get(id)
    if (!category || seen.has(id)) continue
    seen.add(id)
    ordered.push(category)
  }

  for (const category of categories) {
    if (seen.has(category.id)) continue
    seen.add(category.id)
    ordered.push(category)
  }

  return ordered
}

export function upsertShoppingHistory(
  history: ShoppingHistoryItem[],
  name: string,
  shoppingCategoryId: string | null = null,
  ingredientId: string | null = null,
): ShoppingHistoryItem[] {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return history

  const now = new Date().toISOString()
  const existing = history.find((item) => item.name.trim().toLowerCase() === normalized)

  if (existing) {
    return history.map((item) =>
      item.id === existing.id
        ? { ...item, name: name.trim(), lastPurchasedAt: now, shoppingCategoryId, ingredientId }
        : item,
    )
  }

  return [
    ...history,
    {
      id: crypto.randomUUID(),
      name: name.trim(),
      lastPurchasedAt: now,
      shoppingCategoryId,
      ingredientId,
    },
  ]
}

export function buildShoppingList(
  state: AppState,
  weekDates: Date[],
  purchases: Record<string, number>,
  dismissed: Record<string, number> = {},
): ShoppingItem[] {
  const required = buildRequiredShoppingQuantities(state, weekDates)

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
    const dismissedQuantity = dismissed[ingredientId] ?? 0
    const outstandingQuantity = Math.max(requiredQuantity - purchasedQuantity - dismissedQuantity, 0)

    if (purchasedQuantity > 0) {
      lines.push({
        lineId: `purchased:${ingredientId}`,
        ingredientId,
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: purchasedQuantity,
        totalQuantity: requiredQuantity || purchasedQuantity,
        checked: true,
        shoppingCategoryId: ingredient.shoppingCategoryId ?? null,
      })
    }

    if (outstandingQuantity > 0) {
      lines.push({
        lineId: `outstanding:${ingredientId}`,
        ingredientId,
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: outstandingQuantity,
        totalQuantity: requiredQuantity,
        checked: false,
        shoppingCategoryId: ingredient.shoppingCategoryId ?? null,
      })
    }
  }

  return lines.sort((a, b) => {
    if (a.checked !== b.checked) return Number(a.checked) - Number(b.checked)
    return a.name.localeCompare(b.name)
  })
}

export function buildRequiredShoppingQuantities(state: AppState, weekDates: Date[]) {
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

  return required
}

export function formatHistoryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}
