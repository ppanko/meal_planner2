import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  sharedStateId: 'test-household',
  supabase: {},
  supabaseConfigured: false,
}))

import { seedProteinCategories, seedState } from './data'
import { loadState, normalizeState, resetState, saveState } from './storage'
import type { AppState } from './types'

beforeEach(async () => {
  localStorage.clear()
  await resetState()
})

describe('normalizeState', () => {
  it('fills missing state from current seed data and fresh collections', () => {
    const result = normalizeState({})

    expect(result.ingredients).toHaveLength(seedState.ingredients.length)
    expect(result.meals).toHaveLength(seedState.meals.length)
    expect(result.proteinCategories).toEqual(seedProteinCategories)
    expect(result.planner).toEqual({})
    expect(result.manualShoppingItems).toEqual({})
    expect(result.shoppingDismissedByWeek).toEqual({})
    expect(result.shoppingCategories?.map(({ id }) => id)).toEqual([
      'produce', 'meat', 'dairy', 'frozen', 'aisle',
    ])
  })

  it('migrates legacy planner strings and limits arrays to three valid ids', () => {
    const result = normalizeState({
      planner: {
        '2026-08-17': {
          Breakfast: 'pancakes' as unknown as string[],
          Lunch: ['one', 2, 'three', 'four', 'five'] as unknown as string[],
          Dinner: null as unknown as string[],
        },
      },
    })

    expect(result.planner['2026-08-17']).toEqual({
      Breakfast: ['pancakes'],
      Lunch: ['one', 'three', 'four'],
      Dinner: [],
    })
  })

  it('migrates legacy ingredient and meal protein fields', () => {
    const result = normalizeState({
      ingredients: [
        { id: 'chicken', name: 'Chicken', unit: 'lb' } as AppState['ingredients'][number],
        { id: 'mystery', name: 'Mystery', unit: 'each', proteinCategoryId: 'invalid' },
      ],
      meals: [{
        id: 'legacy',
        name: 'Legacy meal',
        type: 'Dinner',
        protein: 'Chicken',
        ingredients: [{ ingredientId: 'chicken', quantity: 1 }],
      } as unknown as AppState['meals'][number]],
    })

    expect(result.ingredients).toEqual([
      expect.objectContaining({ id: 'chicken', proteinCategoryId: 'chicken' }),
      expect.objectContaining({ id: 'mystery', proteinCategoryId: null }),
    ])
    expect(result.meals[0].proteinCategoryOverrideId).toBe('chicken')
  })

  it('removes a stale legacy None override when ingredients provide protein', () => {
    const result = normalizeState({
      ingredients: [{ id: 'chicken', name: 'Chicken', unit: 'lb', proteinCategoryId: 'chicken' }],
      meals: [{
        id: 'meal',
        name: 'Meal',
        type: 'Dinner',
        proteinCategoryOverrideId: 'none',
        ingredients: [{ ingredientId: 'chicken', quantity: 1 }],
      }],
    })

    expect(result.meals[0].proteinCategoryOverrideId).toBeNull()
  })

  it('adds recipe defaults and sanitizes saved recipe details', () => {
    const legacy = normalizeState({ meals: [{
      id: 'legacy', name: 'Legacy', type: 'Dinner', proteinCategoryOverrideId: null, ingredients: [],
    }] })
    expect(legacy.meals[0]).toEqual(expect.objectContaining({ recipeUrl: '', notes: '', instructions: [] }))

    const result = normalizeState({ meals: [{
      id: 'recipe',
      name: 'Recipe',
      type: 'Dinner',
      proteinCategoryOverrideId: null,
      ingredients: [],
      recipeUrl: ' example.com/recipe ',
      notes: '  Remember this.  ',
      instructions: ['  First  ', '', ' Second ', 42] as unknown as string[],
    }] })
    expect(result.meals[0]).toEqual(expect.objectContaining({
      recipeUrl: 'https://example.com/recipe',
      notes: 'Remember this.',
      instructions: ['First', 'Second'],
    }))

    const unsafe = normalizeState({ meals: [{ ...result.meals[0], recipeUrl: 'javascript:alert(1)' }] })
    expect(unsafe.meals[0].recipeUrl).toBe('')
  })

  it('sanitizes categories, order, and category references', () => {
    const result = normalizeState({
      shoppingCategories: [
        { id: 'produce', name: 'Fresh Produce' },
        { id: '  custom  ', name: '  Pantry extras ' },
        { id: '', name: 'Invalid' },
      ],
      shoppingCategoryOrder: ['custom', 'missing', 'custom'],
      ingredients: [
        { id: 'a', name: 'A', unit: 'each', proteinCategoryId: null, shoppingCategoryId: 'custom' },
        { id: 'b', name: 'B', unit: 'each', proteinCategoryId: null, shoppingCategoryId: 'missing' },
      ],
      manualShoppingItems: {
        '2026-08-17': [
          { id: 'a', name: 'A', checked: false, shoppingCategoryId: 'custom' },
          { id: 'b', name: 'B', checked: false, shoppingCategoryId: 'missing' },
        ],
      },
      shoppingHistory: [
        { id: 'h', name: 'A', lastPurchasedAt: '2026-01-01', shoppingCategoryId: 'missing' },
      ],
    })

    expect(result.shoppingCategories).toContainEqual({ id: 'custom', name: 'Pantry extras' })
    expect(result.shoppingCategoryOrder).toEqual([
      'custom', 'produce', 'meat', 'dairy', 'frozen', 'aisle',
    ])
    expect(result.ingredients.map(({ shoppingCategoryId }) => shoppingCategoryId)).toEqual(['custom', null])
    expect(result.manualShoppingItems['2026-08-17'].map(({ shoppingCategoryId }) => shoppingCategoryId))
      .toEqual(['custom', null])
    expect(result.shoppingHistory[0]).toMatchObject({ ingredientId: 'a', shoppingCategoryId: 'custom' })
  })

  it('normalizes optional links and quantities for manually added shopping items', () => {
    const result = normalizeState({
      ingredients: [{ id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null }],
      manualShoppingItems: {
        '2026-08-17': [
          { id: 'valid', name: 'Milk', checked: false, ingredientId: 'milk', quantity: 2, unit: ' cup ' },
          { id: 'invalid', name: 'Other', checked: false, ingredientId: 'missing', quantity: -1, unit: ' ' },
        ],
      },
    })

    expect(result.manualShoppingItems['2026-08-17'][0]).toMatchObject({ ingredientId: 'milk', quantity: 2, unit: 'cup' })
    expect(result.manualShoppingItems['2026-08-17'][1]).toMatchObject({ ingredientId: 'other', quantity: undefined, unit: undefined })
    expect(result.ingredients).toContainEqual({
      id: 'other',
      name: 'Other',
      unit: 'each',
      proteinCategoryId: null,
      shoppingCategoryId: null,
    })
  })

  it('migrates manual and history-only items into one durable ingredient catalog', () => {
    const result = normalizeState({
      ingredients: [],
      manualShoppingItems: {
        '2026-08-17': [{
          id: 'manual-sweet-potatoes',
          name: 'Sweet potatoes',
          checked: false,
          shoppingCategoryId: 'produce',
        }],
      },
      shoppingHistory: [{
        id: 'history-sweet-potatoes',
        name: ' sweet potatoes ',
        lastPurchasedAt: '2026-08-01',
        shoppingCategoryId: 'produce',
      }],
    })

    expect(result.ingredients).toEqual([{
      id: 'sweet-potatoes',
      name: 'Sweet potatoes',
      unit: 'each',
      proteinCategoryId: null,
      shoppingCategoryId: 'produce',
    }])
    expect(result.manualShoppingItems['2026-08-17'][0]).toMatchObject({
      ingredientId: 'sweet-potatoes',
      shoppingCategoryId: 'produce',
    })
    expect(result.shoppingHistory[0]).toMatchObject({
      ingredientId: 'sweet-potatoes',
      shoppingCategoryId: 'produce',
    })
  })

  it('does not share mutable seed arrays across normalized states', () => {
    const first = normalizeState({})
    const second = normalizeState({})
    first.ingredients[0].name = 'Changed'
    expect(second.ingredients[0].name).not.toBe('Changed')
  })
})

describe('local persistence', () => {
  it('loads seed state when storage is empty', async () => {
    const result = await loadState()
    expect(result.meals.map(({ id }) => id)).toEqual(seedState.meals.map(({ id }) => id))
  })

  it('round-trips normalized state through IndexedDB', async () => {
    await saveState({
      ...normalizeState({}),
      meals: [],
      planner: { '2026-08-17': { Dinner: ['missing'] } },
    })

    const result = await loadState()
    expect(result.meals).toEqual([])
    expect(result.planner['2026-08-17'].Dinner).toEqual(['missing'])
  })

  it('migrates legacy localStorage data into IndexedDB and removes the old key', async () => {
    localStorage.setItem('meal-planner-state-v1', JSON.stringify({
      ...normalizeState({}),
      meals: [],
    }))

    expect((await loadState()).meals).toEqual([])
    expect(localStorage.getItem('meal-planner-state-v1')).toBeNull()
    expect((await loadState()).meals).toEqual([])
  })

  it('clears locally persisted state', async () => {
    await saveState({ ...normalizeState({}), meals: [] })
    await resetState()
    expect((await loadState()).meals).toHaveLength(seedState.meals.length)
  })
})
