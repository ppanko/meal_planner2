import { describe, expect, it } from 'vitest'
import type { Ingredient, ManualShoppingItem, ShoppingHistoryItem, ShoppingItem } from '../types'
import { buildCategoryItems, combineShoppingItems, filterShoppingHistory, getShoppingSuggestions, groupShoppingItems } from './shoppingViewModel'

const ingredients: Ingredient[] = [
  { id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null, shoppingCategoryId: 'dairy' },
  { id: 'coffee', name: 'Coffee', unit: 'tbsp', proteinCategoryId: null, shoppingCategoryId: null },
]

describe('shopping view model', () => {
  it('combines, sorts, and groups meal and manual items without changing their identity', () => {
    const shopping: ShoppingItem[] = [{ lineId: 'meal-milk', ingredientId: 'milk', name: 'Milk', quantity: 2, totalQuantity: 4, unit: 'cup', checked: false, shoppingCategoryId: 'dairy' }]
    const manual: ManualShoppingItem[] = [{ id: 'bread', name: 'Bread', checked: true, shoppingCategoryId: 'missing' }]
    const combined = combineShoppingItems(shopping, manual, ingredients)

    expect(combined.map(({ kind, name }) => [kind, name])).toEqual([['manual', 'Bread'], ['meal', 'Milk']])
    expect(combined[1]).toMatchObject({ kind: 'meal', quantity: 2, totalQuantity: 4 })
    expect(groupShoppingItems(combined, [{ id: 'dairy', name: 'Dairy' }])).toEqual([
      expect.objectContaining({ id: 'dairy', items: [expect.objectContaining({ id: 'meal-milk' })] }),
      expect.objectContaining({ id: '__uncategorized__', items: [expect.objectContaining({ id: 'bread' })] }),
    ])
  })

  it('keeps a custom item separate from a same-name meal ingredient', () => {
    const combined = combineShoppingItems(
      [{ lineId: 'meal-milk', ingredientId: 'milk', name: 'Milk', quantity: 2, unit: 'cup', checked: false }],
      [{ id: 'extra-milk', name: 'Milk', checked: false, ingredientId: 'milk', shoppingCategoryId: 'aisle' }],
      ingredients,
    )

    expect(combined).toHaveLength(2)
    expect(combined.map(({ kind }) => kind)).toEqual(['meal', 'manual'])
    expect(combined[1]).toMatchObject({ ingredientId: 'milk', categoryId: 'dairy' })
  })

  it('prioritizes prefix suggestions, deduplicates names, and excludes needed items', () => {
    const history: ShoppingHistoryItem[] = [
      { id: '1', name: 'Coffee', lastPurchasedAt: '2026-08-01' },
      { id: '2', name: 'Milk chocolate', lastPurchasedAt: '2026-08-02' },
      { id: '3', name: 'MILK', lastPurchasedAt: '2026-08-03' },
    ]

    expect(getShoppingSuggestions('mi', ingredients, history, new Set(['milk']))).toEqual(['Milk chocolate'])
    expect(getShoppingSuggestions('', ingredients, history, new Set())).toEqual([])
  })

  it('sorts history by recency and filters case-insensitively', () => {
    const history: ShoppingHistoryItem[] = [
      { id: 'old', name: 'Coffee', lastPurchasedAt: '2026-08-01' },
      { id: 'new', name: 'Cold brew', lastPurchasedAt: '2026-08-10' },
    ]
    expect(filterShoppingHistory(history, 'co').map(({ id }) => id)).toEqual(['new', 'old'])
  })

  it('merges manual items with matching ingredient category records', () => {
    const items = buildCategoryItems(ingredients, [
      { id: 'manual-milk', name: ' milk ', checked: false },
      { id: 'bread', name: 'Bread', checked: false, shoppingCategoryId: 'bakery' },
    ], 'mi')
    expect(items).toEqual([expect.objectContaining({
      ingredientId: 'milk',
      manualIds: ['manual-milk'],
      categoryId: 'dairy',
    })])
  })
})
