import { useMemo } from 'react'
import { defaultShoppingCategories } from '../types'
import type { AppState, ManualShoppingItem, ShoppingCategory } from '../types'
import { dateKey } from '../utils/dates'
import { slug } from '../utils/text'
import { ensureCatalogIngredient } from './ingredientCatalog'
import {
  buildShoppingList,
  buildRequiredShoppingQuantities,
  defaultShoppingCategoryIds,
  getOrderedShoppingCategories,
  upsertShoppingHistory,
} from './shoppingUtils'

type ShoppingControllerOptions = {
  state: AppState | null
  weekDates: Date[]
  update: (next: AppState) => void
  updateWithUndo: (next: AppState, message: string) => void
}

export function useShoppingController({
  state,
  weekDates,
  update,
  updateWithUndo,
}: ShoppingControllerOptions) {
  const shoppingWeekKey = dateKey(weekDates[0])

  const shopping = useMemo(
    () => state
      ? buildShoppingList(
          state,
          weekDates,
          state.shoppingPurchasesByWeek[shoppingWeekKey] ?? {},
          state.shoppingDismissedByWeek[shoppingWeekKey] ?? {},
        )
      : [],
    [state, weekDates, shoppingWeekKey],
  )

  const manualShopping = state?.manualShoppingItems[shoppingWeekKey] ?? []
  const orderedShoppingCategories = useMemo(
    () => state ? getOrderedShoppingCategories(state) : defaultShoppingCategories,
    [state],
  )

  function addShoppingCategory(name: string) {
    if (!state) return

    const trimmed = name.trim()
    if (!trimmed) return

    const categories = getOrderedShoppingCategories(state)
    if (categories.some((category) => category.name.trim().toLowerCase() === trimmed.toLowerCase())) return

    const category: ShoppingCategory = {
      id: `custom-${slug(trimmed)}-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
    }
    const nextCategories = [...categories, category]

    update({
      ...state,
      shoppingCategories: nextCategories,
      shoppingCategoryOrder: nextCategories.map((item) => item.id),
    })
  }

  function moveShoppingCategory(categoryId: string, direction: -1 | 1) {
    if (!state) return

    const categories = getOrderedShoppingCategories(state)
    const index = categories.findIndex((category) => category.id === categoryId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= categories.length) return

    const reordered = [...categories]
    const [category] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, category)

    update({
      ...state,
      shoppingCategories: state.shoppingCategories && state.shoppingCategories.length > 0
        ? state.shoppingCategories
        : defaultShoppingCategories.map((item) => ({ ...item })),
      shoppingCategoryOrder: reordered.map((item) => item.id),
    })
  }

  function deleteShoppingCategory(categoryId: string) {
    if (!state || defaultShoppingCategoryIds.has(categoryId)) return

    const categories = getOrderedShoppingCategories(state)
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return

    const ingredientAssignments = state.ingredients.filter(
      (ingredient) => ingredient.shoppingCategoryId === categoryId,
    ).length
    const manualAssignments = Object.values(state.manualShoppingItems).reduce(
      (count, items) => count + items.filter((item) => item.shoppingCategoryId === categoryId).length,
      0,
    )
    const historyAssignments = state.shoppingHistory.filter(
      (item) => item.shoppingCategoryId === categoryId,
    ).length
    const assignedCount = ingredientAssignments + manualAssignments + historyAssignments
    const detail = assignedCount > 0
      ? ` ${assignedCount} assigned item${assignedCount === 1 ? '' : 's'} will become uncategorized.`
      : ''

    if (!confirm(`Delete shopping category "${category.name}"?${detail}`)) return

    const manualShoppingItems: AppState['manualShoppingItems'] = Object.fromEntries(
      Object.entries(state.manualShoppingItems).map(([weekKey, items]) => [
        weekKey,
        items.map((item) =>
          item.shoppingCategoryId === categoryId
            ? { ...item, shoppingCategoryId: null }
            : item,
        ),
      ]),
    )

    updateWithUndo({
      ...state,
      ingredients: state.ingredients.map((ingredient) =>
        ingredient.shoppingCategoryId === categoryId
          ? { ...ingredient, shoppingCategoryId: null }
          : ingredient,
      ),
      manualShoppingItems,
      shoppingHistory: state.shoppingHistory.map((item) =>
        item.shoppingCategoryId === categoryId
          ? { ...item, shoppingCategoryId: null }
          : item,
      ),
      shoppingCategories: categories.filter((item) => item.id !== categoryId),
      shoppingCategoryOrder: categories
        .filter((item) => item.id !== categoryId)
        .map((item) => item.id),
    }, `Deleted shopping category ${category.name}`)
  }

  function toggleShopping(lineId: string) {
    if (!state) return

    const item = shopping.find((entry) => entry.lineId === lineId)
    if (!item) return

    const currentPurchases = state.shoppingPurchasesByWeek[shoppingWeekKey] ?? {}
    const currentPurchased = currentPurchases[item.ingredientId] ?? 0
    const nextPurchases = { ...currentPurchases }

    if (item.checked) delete nextPurchases[item.ingredientId]
    else nextPurchases[item.ingredientId] = currentPurchased + item.quantity

    const ingredient = state.ingredients.find((entry) => entry.id === item.ingredientId)

    update({
      ...state,
      shoppingPurchasesByWeek: {
        ...state.shoppingPurchasesByWeek,
        [shoppingWeekKey]: nextPurchases,
      },
      shoppingHistory:
        !item.checked && ingredient
          ? upsertShoppingHistory(
              state.shoppingHistory,
              ingredient.name,
              ingredient.shoppingCategoryId ?? null,
              ingredient.id,
            )
          : state.shoppingHistory,
    })
  }

  function addCatalogShoppingItem(name: string, shoppingCategoryId: string | null = null) {
    if (!state) return
    const trimmed = name.trim()
    if (!trimmed) return

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const normalized = trimmed.toLowerCase()
    if (current.some((item) => !item.checked && item.name.trim().toLowerCase() === normalized)) return

    const catalog = ensureCatalogIngredient(state.ingredients, trimmed, shoppingCategoryId)
    const ingredient = catalog.ingredient

    const item: ManualShoppingItem = {
      id: crypto.randomUUID(),
      name: trimmed,
      checked: false,
      shoppingCategoryId: ingredient.shoppingCategoryId ?? null,
      ingredientId: ingredient.id,
      quantity: 1,
      unit: ingredient.unit,
    }

    update({
      ...state,
      ingredients: catalog.ingredients,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: [...current, item],
      },
    })
  }

  function addManualShoppingItem(name: string) {
    addCatalogShoppingItem(name)
  }

  function addHistoryItemToShopping(name: string, shoppingCategoryId: string | null = null) {
    addCatalogShoppingItem(name, shoppingCategoryId)
  }

  function setShoppingItemCategory(
    ingredientId: string | null,
    manualIds: string[],
    categoryId: string | null,
  ) {
    if (!state) return

    const validCategoryIds = new Set(getOrderedShoppingCategories(state).map((category) => category.id))
    const nextCategoryId = categoryId && validCategoryIds.has(categoryId) ? categoryId : null
    const manualIdSet = new Set(manualIds)
    const selectedNames = new Set(
      (state.manualShoppingItems[shoppingWeekKey] ?? [])
        .filter((item) => manualIdSet.has(item.id))
        .map((item) => item.name.trim().toLowerCase()),
    )

    update({
      ...state,
      ingredients: state.ingredients.map((ingredient) =>
        ingredient.id === ingredientId
          ? { ...ingredient, shoppingCategoryId: nextCategoryId }
          : ingredient,
      ),
      manualShoppingItems: Object.fromEntries(
        Object.entries(state.manualShoppingItems).map(([weekKey, items]) => [
          weekKey,
          items.map((item) =>
            (ingredientId !== null && item.ingredientId === ingredientId) || manualIdSet.has(item.id)
              ? { ...item, shoppingCategoryId: nextCategoryId }
              : item,
          ),
        ]),
      ),
      shoppingHistory: state.shoppingHistory.map((item) =>
        (ingredientId !== null && item.ingredientId === ingredientId)
          || selectedNames.has(item.name.trim().toLowerCase())
          ? { ...item, ingredientId, shoppingCategoryId: nextCategoryId }
          : item,
      ),
    })
  }

  function deleteShoppingHistoryItem(id: string) {
    if (!state) return

    const deletedItem = state.shoppingHistory.find((item) => item.id === id)
    updateWithUndo({
      ...state,
      shoppingHistory: state.shoppingHistory.filter((item) => item.id !== id),
    }, deletedItem ? `Removed ${deletedItem.name} from history` : 'Removed history item')
  }

  function toggleManualShoppingItem(id: string) {
    if (!state) return

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const target = current.find((item) => item.id === id)
    if (!target) return

    const nextChecked = !target.checked
    update({
      ...state,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: current.map((item) =>
          item.id === id ? { ...item, checked: nextChecked } : item,
        ),
      },
      shoppingHistory: nextChecked
        ? upsertShoppingHistory(
            state.shoppingHistory,
            target.name,
            target.shoppingCategoryId ?? null,
            target.ingredientId ?? null,
          )
        : state.shoppingHistory,
    })
  }

  function deleteManualShoppingItem(id: string) {
    if (!state) return
    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const deletedItem = current.find((item) => item.id === id)

    updateWithUndo({
      ...state,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: current.filter((item) => item.id !== id),
      },
    }, deletedItem ? `Removed ${deletedItem.name}` : 'Removed shopping item')
  }

  function clearCheckedShopping() {
    if (!state) return

    const current = state.manualShoppingItems[shoppingWeekKey] ?? []
    const shoppingPurchasesByWeek = { ...state.shoppingPurchasesByWeek }
    delete shoppingPurchasesByWeek[shoppingWeekKey]

    updateWithUndo({
      ...state,
      shoppingPurchasesByWeek,
      manualShoppingItems: {
        ...state.manualShoppingItems,
        [shoppingWeekKey]: current.map((item) => ({ ...item, checked: false })),
      },
    }, 'Reset checked shopping items')
  }

  function clearShoppingList() {
    if (!state || (shopping.length === 0 && manualShopping.length === 0)) return
    if (!confirm('Clear all items from the current shopping list?')) return

    const shoppingPurchasesByWeek = { ...state.shoppingPurchasesByWeek }
    delete shoppingPurchasesByWeek[shoppingWeekKey]

    const manualShoppingItems = { ...state.manualShoppingItems }
    delete manualShoppingItems[shoppingWeekKey]

    const shoppingDismissedByWeek = { ...state.shoppingDismissedByWeek }
    const required = Object.fromEntries(buildRequiredShoppingQuantities(state, weekDates))
    if (Object.keys(required).length > 0) shoppingDismissedByWeek[shoppingWeekKey] = required
    else delete shoppingDismissedByWeek[shoppingWeekKey]

    updateWithUndo({
      ...state,
      shoppingPurchasesByWeek,
      shoppingDismissedByWeek,
      manualShoppingItems,
    }, 'Cleared shopping list')
  }

  return {
    shopping,
    manualShopping,
    orderedShoppingCategories,
    addShoppingCategory,
    moveShoppingCategory,
    deleteShoppingCategory,
    toggleShopping,
    addManualShoppingItem,
    addHistoryItemToShopping,
    setShoppingItemCategory,
    deleteShoppingHistoryItem,
    toggleManualShoppingItem,
    deleteManualShoppingItem,
    clearCheckedShopping,
    clearShoppingList,
  }
}
