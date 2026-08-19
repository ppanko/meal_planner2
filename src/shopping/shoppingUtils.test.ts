import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import {
  buildShoppingList,
  formatHistoryDate,
  getOrderedShoppingCategories,
  upsertShoppingHistory,
} from './shoppingUtils'

afterEach(() => vi.useRealTimers())

describe('getOrderedShoppingCategories', () => {
  it('uses the default categories when persisted categories are absent', () => {
    expect(getOrderedShoppingCategories({}).map(({ id }) => id)).toEqual([
      'produce',
      'meat',
      'dairy',
      'frozen',
      'aisle',
    ])
  })

  it('honors valid requested order and appends unmentioned categories once', () => {
    expect(getOrderedShoppingCategories({
      shoppingCategories: [
        { id: 'produce', name: 'Fresh' },
        { id: 'bulk', name: 'Bulk' },
        { id: 'bakery', name: 'Bakery' },
      ],
      shoppingCategoryOrder: ['bulk', 'missing', 'bulk'],
    })).toEqual([
      { id: 'bulk', name: 'Bulk' },
      { id: 'produce', name: 'Fresh' },
      { id: 'bakery', name: 'Bakery' },
    ])
  })
})

describe('upsertShoppingHistory', () => {
  it('does nothing for a blank name', () => {
    const history = [{ id: '1', name: 'Milk', lastPurchasedAt: '2026-01-01T00:00:00.000Z' }]
    expect(upsertShoppingHistory(history, '   ')).toBe(history)
  })

  it('adds a trimmed history entry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')

    expect(upsertShoppingHistory([], '  Apples ', 'produce', 'apples')).toEqual([{
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Apples',
      lastPurchasedAt: '2026-08-19T12:00:00.000Z',
      shoppingCategoryId: 'produce',
      ingredientId: 'apples',
    }])
  })

  it('updates a case-insensitive match without changing its id', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'))
    const history = [
      { id: 'milk-id', name: 'Milk', lastPurchasedAt: '2026-01-01T00:00:00.000Z', shoppingCategoryId: null },
      { id: 'eggs-id', name: 'Eggs', lastPurchasedAt: '2026-01-02T00:00:00.000Z', shoppingCategoryId: null },
    ]

    expect(upsertShoppingHistory(history, ' milk ', 'dairy', 'milk')).toEqual([
      { id: 'milk-id', name: 'milk', lastPurchasedAt: '2026-08-19T12:00:00.000Z', shoppingCategoryId: 'dairy', ingredientId: 'milk' },
      history[1],
    ])
  })
})

describe('buildShoppingList', () => {
  it('combines quantities across meals, occurrences, days, and rows', () => {
    const state = createAppState({
      planner: {
        '2026-08-17': {
          Dinner: ['tacos', 'tacos'],
          Lunch: ['chicken-salad'],
        },
        '2026-08-18': { Dinner: ['tacos', 'missing-meal'] },
      },
    })

    const result = buildShoppingList(state, weekDates, {})
    expect(result.find(({ ingredientId }) => ingredientId === 'ground-beef')).toMatchObject({
      lineId: 'outstanding:ground-beef',
      quantity: 3,
      totalQuantity: 3,
      checked: false,
    })
    expect(result.find(({ ingredientId }) => ingredientId === 'tomatoes')).toMatchObject({
      quantity: 8,
    })
    expect(result.map(({ name }) => name)).toEqual([...result.map(({ name }) => name)].sort())
  })

  it('splits purchased and outstanding quantities and keeps fully purchased items visible', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
    })

    const result = buildShoppingList(state, weekDates, {
      'ground-beef': 0.25,
      tortillas: 8,
      milk: 2,
    })

    expect(result.filter(({ ingredientId }) => ingredientId === 'ground-beef')).toEqual([
      expect.objectContaining({ lineId: 'outstanding:ground-beef', quantity: 0.75, totalQuantity: 1, checked: false }),
      expect.objectContaining({ lineId: 'purchased:ground-beef', quantity: 0.25, totalQuantity: 1, checked: true }),
    ])
    expect(result.filter(({ ingredientId }) => ingredientId === 'tortillas')).toEqual([
      expect.objectContaining({ lineId: 'purchased:tortillas', quantity: 8, checked: true }),
    ])
    expect(result.find(({ ingredientId }) => ingredientId === 'milk')).toMatchObject({
      lineId: 'purchased:milk',
      quantity: 2,
      checked: true,
    })
  })

  it('ignores purchases for unknown ingredients', () => {
    expect(buildShoppingList(createAppState(), weekDates, { missing: 3 })).toEqual([])
  })

  it('subtracts previously cleared quantities while showing newly added needs', () => {
    const state = createAppState({ planner: { '2026-08-17': { Dinner: ['tacos', 'tacos'] } } })
    const result = buildShoppingList(state, weekDates, {}, { 'ground-beef': 1, tortillas: 8 })
    expect(result.find(({ ingredientId }) => ingredientId === 'ground-beef')).toMatchObject({ quantity: 1 })
    expect(result.find(({ ingredientId }) => ingredientId === 'tortillas')).toMatchObject({ quantity: 8 })
  })
})

describe('formatHistoryDate', () => {
  it('returns an empty string for invalid input', () => {
    expect(formatHistoryDate('not-a-date')).toBe('')
  })

  it('omits the year for purchases in the current year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 19))
    expect(formatHistoryDate('2026-08-01T12:00:00.000Z')).toBe('Aug 1')
  })

  it('includes the year for older purchases', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 19))
    expect(formatHistoryDate('2025-08-01T12:00:00.000Z')).toBe('Aug 1, 2025')
  })
})
