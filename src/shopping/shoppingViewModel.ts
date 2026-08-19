import type {
  Ingredient,
  ManualShoppingItem,
  ShoppingCategory,
  ShoppingHistoryItem,
  ShoppingItem,
} from '../types'
import { findIngredientByName } from './ingredientCatalog'

export type CombinedShoppingItem =
  | {
      kind: 'meal'
      id: string
      ingredientId: string
      name: string
      checked: boolean
      unit: string
      quantity: number
      totalQuantity: number
      categoryId: string | null
    }
  | {
      kind: 'manual'
      id: string
      name: string
      checked: boolean
      ingredientId: string | null
      unit: string
      quantity: number | null
      categoryId: string | null
    }

export type ShoppingGroup = {
  id: string
  name: string
  items: CombinedShoppingItem[]
}

export type CategoryItem = {
  key: string
  name: string
  ingredientId: string | null
  manualIds: string[]
  categoryId: string | null
}

export function combineShoppingItems(
  shopping: ShoppingItem[],
  manualItems: ManualShoppingItem[],
  ingredients: Ingredient[],
): CombinedShoppingItem[] {
  const mealItems: CombinedShoppingItem[] = shopping.map((item) => ({
    kind: 'meal',
    id: item.lineId,
    ingredientId: item.ingredientId,
    name: item.name,
    checked: item.checked,
    unit: item.unit,
    quantity: item.quantity,
    totalQuantity: item.totalQuantity ?? item.quantity,
    categoryId: item.shoppingCategoryId ?? null,
  }))
  const manual: CombinedShoppingItem[] = manualItems.map((item) => {
    const ingredient = item.ingredientId
      ? ingredients.find((candidate) => candidate.id === item.ingredientId)
      : findIngredientByName(ingredients, item.name)
    return {
      kind: 'manual',
      id: item.id,
      name: item.name,
      checked: item.checked,
      ingredientId: ingredient?.id ?? item.ingredientId ?? null,
      unit: item.unit ?? ingredient?.unit ?? '',
      quantity: item.quantity ?? null,
      categoryId: ingredient?.shoppingCategoryId ?? item.shoppingCategoryId ?? null,
    }
  })

  return [...mealItems, ...manual].sort((a, b) => a.name.localeCompare(b.name))
}

export function groupShoppingItems(
  items: CombinedShoppingItem[],
  categories: ShoppingCategory[],
): ShoppingGroup[] {
  const groups = categories.map((category) => ({
    id: category.id,
    name: category.name,
    items: items.filter((item) => item.categoryId === category.id),
  }))
  const validCategoryIds = new Set(categories.map((category) => category.id))
  const uncategorized = items.filter(
    (item) => !item.categoryId || !validCategoryIds.has(item.categoryId),
  )

  if (uncategorized.length > 0) {
    groups.push({ id: '__uncategorized__', name: 'Uncategorized', items: uncategorized })
  }

  return groups.filter((group) => group.items.length > 0)
}

export function filterShoppingHistory(history: ShoppingHistoryItem[], search: string) {
  const query = search.trim().toLowerCase()

  return [...history]
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const dateDiff =
        new Date(b.lastPurchasedAt).getTime() - new Date(a.lastPurchasedAt).getTime()
      return dateDiff || a.name.localeCompare(b.name)
    })
}

export function getShoppingSuggestions(
  query: string,
  ingredients: Ingredient[],
  history: ShoppingHistoryItem[],
  neededNames: Set<string>,
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const names = new Map<string, string>()
  for (const name of [
    ...ingredients.map((ingredient) => ingredient.name),
    ...history.map((item) => item.name),
  ]) {
    const trimmed = name.trim()
    if (trimmed && !names.has(trimmed.toLowerCase())) names.set(trimmed.toLowerCase(), trimmed)
  }

  return [...names.values()]
    .filter((name) => {
      const normalized = name.toLowerCase()
      return normalized !== normalizedQuery &&
        normalized.includes(normalizedQuery) &&
        !neededNames.has(normalized)
    })
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(normalizedQuery)
      const bStarts = b.toLowerCase().startsWith(normalizedQuery)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return a.localeCompare(b)
    })
    .slice(0, 6)
}

export function buildCategoryItems(
  ingredients: Ingredient[],
  manualItems: ManualShoppingItem[],
  search: string,
): CategoryItem[] {
  const byName = new Map<string, CategoryItem>()

  for (const ingredient of ingredients) {
    byName.set(ingredient.name.trim().toLowerCase(), {
      key: `ingredient-${ingredient.id}`,
      name: ingredient.name,
      ingredientId: ingredient.id,
      manualIds: [],
      categoryId: ingredient.shoppingCategoryId ?? null,
    })
  }

  for (const item of manualItems) {
    const normalized = item.name.trim().toLowerCase()
    const linkedIngredient = item.ingredientId
      ? ingredients.find((ingredient) => ingredient.id === item.ingredientId)
      : ingredients.find((ingredient) => ingredient.name.trim().toLowerCase() === normalized)
    const key = linkedIngredient?.name.trim().toLowerCase() ?? normalized
    const existing = byName.get(key)

    if (existing) {
      existing.manualIds.push(item.id)
    } else {
      byName.set(key, {
        key: `manual-${item.id}`,
        name: item.name,
        ingredientId: null,
        manualIds: [item.id],
        categoryId: item.shoppingCategoryId ?? null,
      })
    }
  }

  const query = search.trim().toLowerCase()
  return [...byName.values()]
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
}
