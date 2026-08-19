import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import type { AppState } from '../types'
import { useShoppingController } from './useShoppingController'

function setup(state: AppState | null = createAppState()) {
  const update = vi.fn()
  const updateWithUndo = vi.fn()
  const hook = renderHook(() => useShoppingController({ state, weekDates, update, updateWithUndo }))
  return { ...hook, update, updateWithUndo }
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000020')
})

describe('useShoppingController categories', () => {
  it('assigns only known categories to ingredients', () => {
    const state = createAppState()
    const { result, update } = setup(state)

    act(() => result.current.setShoppingItemCategory('eggs', [], 'dairy'))
    expect(update.mock.calls[0][0].ingredients.find(({ id }: { id: string }) => id === 'eggs'))
      .toMatchObject({ shoppingCategoryId: 'dairy' })

    act(() => result.current.setShoppingItemCategory('eggs', [], 'missing'))
    expect(update.mock.calls[1][0].ingredients.find(({ id }: { id: string }) => id === 'eggs'))
      .toMatchObject({ shoppingCategoryId: null })
  })

  it('adds trimmed unique custom categories with stable order', () => {
    const state = createAppState()
    const { result, update } = setup(state)

    act(() => result.current.addShoppingCategory('  International Foods '))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      shoppingCategories: expect.arrayContaining([{
        id: 'custom-international-foods-00000000',
        name: 'International Foods',
      }]),
      shoppingCategoryOrder: expect.arrayContaining(['custom-international-foods-00000000']),
    }))

    update.mockClear()
    act(() => result.current.addShoppingCategory(' produce '))
    act(() => result.current.addShoppingCategory('  '))
    expect(update).not.toHaveBeenCalled()
  })

  it('moves categories within bounds', () => {
    const state = createAppState()
    const { result, update } = setup(state)

    act(() => result.current.moveShoppingCategory('meat', -1))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      shoppingCategoryOrder: ['meat', 'produce', 'dairy', 'frozen', 'aisle'],
    }))

    update.mockClear()
    act(() => result.current.moveShoppingCategory('produce', -1))
    act(() => result.current.moveShoppingCategory('missing', 1))
    expect(update).not.toHaveBeenCalled()
  })

  it('deletes custom categories and clears every assignment with undo', () => {
    const state = createAppState({
      shoppingCategories: [
        { id: 'produce', name: 'Produce' },
        { id: 'meat', name: 'Meat' },
        { id: 'dairy', name: 'Dairy' },
        { id: 'frozen', name: 'Frozen' },
        { id: 'aisle', name: 'Aisle' },
        { id: 'custom', name: 'Custom' },
      ],
      shoppingCategoryOrder: ['custom', 'produce', 'meat', 'dairy', 'frozen', 'aisle'],
      ingredients: createAppState().ingredients.map((item, index) =>
        index === 0 ? { ...item, shoppingCategoryId: 'custom' } : item,
      ),
      manualShoppingItems: {
        '2026-08-17': [{ id: 'm', name: 'Manual', checked: false, shoppingCategoryId: 'custom' }],
      },
      shoppingHistory: [{
        id: 'h', name: 'History', lastPurchasedAt: '2026-08-01', shoppingCategoryId: 'custom',
      }],
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.deleteShoppingCategory('custom'))

    const next = updateWithUndo.mock.calls[0][0] as AppState
    expect(next.shoppingCategories).not.toContainEqual(expect.objectContaining({ id: 'custom' }))
    expect(next.ingredients[0].shoppingCategoryId).toBeNull()
    expect(next.manualShoppingItems['2026-08-17'][0].shoppingCategoryId).toBeNull()
    expect(next.shoppingHistory[0].shoppingCategoryId).toBeNull()
    expect(updateWithUndo.mock.calls[0][1]).toBe('Deleted shopping category Custom')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3 assigned items'))
  })

  it('protects defaults and respects category deletion cancellation', () => {
    const state = createAppState({
      shoppingCategories: [
        { id: 'produce', name: 'Produce' },
        { id: 'custom', name: 'Custom' },
      ],
    })
    const { result, updateWithUndo } = setup(state)
    act(() => result.current.deleteShoppingCategory('produce'))
    vi.mocked(window.confirm).mockReturnValue(false)
    act(() => result.current.deleteShoppingCategory('custom'))
    expect(updateWithUndo).not.toHaveBeenCalled()
  })
})

describe('useShoppingController generated items', () => {
  it('marks an outstanding generated item purchased and records history', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
      ingredients: createAppState().ingredients.map((item) =>
        item.id === 'ground-beef' ? { ...item, shoppingCategoryId: 'meat' } : item,
      ),
    })
    const { result, update } = setup(state)

    act(() => result.current.toggleShopping('outstanding:ground-beef'))
    const next = update.mock.calls[0][0] as AppState
    expect(next.shoppingPurchasesByWeek['2026-08-17']['ground-beef']).toBe(1)
    expect(next.shoppingHistory).toEqual([
      expect.objectContaining({ name: 'Ground beef', shoppingCategoryId: 'meat', ingredientId: 'ground-beef' }),
    ])
  })

  it('unchecks a purchased generated item by removing its purchase record', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
      shoppingPurchasesByWeek: { '2026-08-17': { 'ground-beef': 1, tortillas: 2 } },
    })
    const { result, update } = setup(state)

    act(() => result.current.toggleShopping('purchased:ground-beef'))
    expect(update.mock.calls[0][0].shoppingPurchasesByWeek['2026-08-17']).toEqual({ tortillas: 2 })
  })

  it('ignores unknown generated lines', () => {
    const { result, update } = setup()
    act(() => result.current.toggleShopping('outstanding:missing'))
    expect(update).not.toHaveBeenCalled()
  })
})

describe('useShoppingController manual items and history', () => {
  it('adds trimmed manual and history items while preventing duplicates', () => {
    const state = createAppState({
      manualShoppingItems: {
        '2026-08-17': [{ id: 'existing', name: 'Milk', checked: false, shoppingCategoryId: null }],
      },
    })
    const { result, update } = setup(state)

    act(() => result.current.addManualShoppingItem('  Apples '))
    let next = update.mock.calls[0][0] as AppState
    expect(next.manualShoppingItems['2026-08-17']).toEqual([
      state.manualShoppingItems['2026-08-17'][0],
      expect.objectContaining({ name: 'Apples', checked: false, shoppingCategoryId: null, ingredientId: 'apples' }),
    ])
    expect(next.ingredients).toContainEqual({
      id: 'apples', name: 'Apples', unit: 'each', proteinCategoryId: null, shoppingCategoryId: null,
    })

    act(() => result.current.addHistoryItemToShopping('  Bread ', 'aisle'))
    next = update.mock.calls[1][0] as AppState
    expect(next.manualShoppingItems['2026-08-17'][1]).toMatchObject({
      name: 'Bread', shoppingCategoryId: 'aisle', ingredientId: 'bread',
    })
    expect(next.ingredients).toContainEqual(expect.objectContaining({ id: 'bread', shoppingCategoryId: 'aisle' }))

    update.mockClear()
    act(() => result.current.addHistoryItemToShopping(' milk '))
    act(() => result.current.addManualShoppingItem('  '))
    expect(update).not.toHaveBeenCalled()
  })

  it('adds a checked item again without changing any purchase records', () => {
    const state = createAppState({
      ingredients: createAppState().ingredients.map((item) =>
        item.id === 'milk' ? { ...item, shoppingCategoryId: 'dairy' } : item,
      ),
      shoppingPurchasesByWeek: { '2026-08-17': { milk: 1, eggs: 2 } },
      manualShoppingItems: {
        '2026-08-17': [{ id: 'bought-milk', name: 'Milk', checked: true, shoppingCategoryId: 'dairy', ingredientId: 'milk', quantity: 1, unit: 'cup' }],
      },
    })
    const { result, update } = setup(state)

    act(() => result.current.addManualShoppingItem('Milk'))
    let next = update.mock.calls[0][0] as AppState
    expect(next.shoppingPurchasesByWeek).toEqual(state.shoppingPurchasesByWeek)
    expect(next.manualShoppingItems['2026-08-17']).toEqual([
      state.manualShoppingItems['2026-08-17'][0],
      expect.objectContaining({
        name: 'Milk',
        checked: false,
        shoppingCategoryId: 'dairy',
        ingredientId: 'milk',
        quantity: 1,
        unit: 'cup',
      }),
    ])

    update.mockClear()
    act(() => result.current.addHistoryItemToShopping('Milk', 'aisle'))
    next = update.mock.calls[0][0] as AppState
    expect(next.shoppingPurchasesByWeek).toEqual(state.shoppingPurchasesByWeek)
    expect(next.manualShoppingItems['2026-08-17'][1]).toMatchObject({ name: 'Milk', checked: false, ingredientId: 'milk' })
  })

  it('updates the master ingredient and every linked manual and history category', () => {
    const state = createAppState({
      manualShoppingItems: {
        '2026-08-17': [
          { id: 'milk-extra', name: 'Milk', checked: false, shoppingCategoryId: null, ingredientId: 'milk' },
          { id: 'other', name: 'Other', checked: false, shoppingCategoryId: null },
        ],
        '2026-08-24': [
          { id: 'later-milk', name: 'Milk', checked: true, shoppingCategoryId: null, ingredientId: 'milk' },
        ],
      },
      shoppingHistory: [{
        id: 'milk-history', name: 'Milk', lastPurchasedAt: '2026-08-01', ingredientId: 'milk', shoppingCategoryId: null,
      }],
    })
    const { result, update } = setup(state)

    act(() => result.current.setShoppingItemCategory('milk', ['milk-extra'], 'dairy'))
    const next = update.mock.calls[0][0] as AppState
    expect(next.ingredients.find((item) => item.id === 'milk')?.shoppingCategoryId).toBe('dairy')
    expect(next.manualShoppingItems['2026-08-17'][0].shoppingCategoryId).toBe('dairy')
    expect(next.manualShoppingItems['2026-08-17'][1].shoppingCategoryId).toBeNull()
    expect(next.manualShoppingItems['2026-08-24'][0].shoppingCategoryId).toBe('dairy')
    expect(next.shoppingHistory[0]).toMatchObject({ ingredientId: 'milk', shoppingCategoryId: 'dairy' })
  })

  it('toggles items and adds checked items to history', () => {
    const state = createAppState({
      manualShoppingItems: {
        '2026-08-17': [{ id: 'manual', name: 'Bagels', checked: false, shoppingCategoryId: null }],
      },
    })
    const { result, update } = setup(state)

    act(() => result.current.toggleManualShoppingItem('manual'))
    expect(update.mock.calls[0][0].manualShoppingItems['2026-08-17'][0].checked).toBe(true)
    expect(update.mock.calls[0][0].shoppingHistory).toEqual([
      expect.objectContaining({ name: 'Bagels' }),
    ])
  })

  it('deletes manual and history items with descriptive undo messages', () => {
    const state = createAppState({
      manualShoppingItems: {
        '2026-08-17': [{ id: 'manual', name: 'Bagels', checked: false, shoppingCategoryId: null }],
      },
      shoppingHistory: [{ id: 'history', name: 'Milk', lastPurchasedAt: '2026-08-01' }],
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.deleteManualShoppingItem('manual'))
    expect(updateWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({ manualShoppingItems: { '2026-08-17': [] } }),
      'Removed Bagels',
    )

    act(() => result.current.deleteShoppingHistoryItem('history'))
    expect(updateWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({ shoppingHistory: [] }),
      'Removed Milk from history',
    )
  })

  it('resets generated purchases and manual checks for the week', () => {
    const state = createAppState({
      shoppingPurchasesByWeek: {
        '2026-08-17': { eggs: 2 },
        '2026-08-24': { milk: 1 },
      },
      manualShoppingItems: {
        '2026-08-17': [{ id: 'manual', name: 'Bagels', checked: true, shoppingCategoryId: null }],
      },
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.clearCheckedShopping())
    const next = updateWithUndo.mock.calls[0][0] as AppState
    expect(next.shoppingPurchasesByWeek).toEqual({ '2026-08-24': { milk: 1 } })
    expect(next.manualShoppingItems['2026-08-17'][0].checked).toBe(false)
    expect(updateWithUndo.mock.calls[0][1]).toBe('Reset checked shopping items')
  })

  it('clears the current list with undo while preserving history and other weeks', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
      shoppingPurchasesByWeek: {
        '2026-08-17': { 'ground-beef': 1 },
        '2026-08-24': { milk: 1 },
      },
      manualShoppingItems: {
        '2026-08-17': [{ id: 'manual', name: 'Bagels', checked: false }],
        '2026-08-24': [{ id: 'later', name: 'Milk', checked: false }],
      },
      shoppingHistory: [{ id: 'history', name: 'Coffee', lastPurchasedAt: '2026-08-01' }],
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.clearShoppingList())
    const next = updateWithUndo.mock.calls[0][0] as AppState
    expect(next.shoppingPurchasesByWeek).toEqual({ '2026-08-24': { milk: 1 } })
    expect(next.manualShoppingItems).toEqual({ '2026-08-24': state.manualShoppingItems['2026-08-24'] })
    expect(next.shoppingDismissedByWeek['2026-08-17']).toMatchObject({
      'ground-beef': 1,
      tortillas: 8,
      tomatoes: 2,
    })
    expect(next.shoppingHistory).toEqual(state.shoppingHistory)
    expect(next.ingredients).toEqual(state.ingredients)
    expect(updateWithUndo.mock.calls[0][1]).toBe('Cleared shopping list')
  })

  it('preserves a custom ingredient category when clearing and adding it again', () => {
    const sweetPotatoes = {
      id: 'sweet-potatoes',
      name: 'Sweet potatoes',
      unit: 'each',
      proteinCategoryId: null,
      shoppingCategoryId: 'produce',
    }
    const state = createAppState({
      ingredients: [...createAppState().ingredients, sweetPotatoes],
      manualShoppingItems: {
        '2026-08-17': [{
          id: 'manual-sweet-potatoes',
          name: 'Sweet potatoes',
          checked: false,
          ingredientId: 'sweet-potatoes',
          shoppingCategoryId: 'produce',
        }],
      },
      shoppingHistory: [{
        id: 'history-sweet-potatoes',
        name: 'Sweet potatoes',
        lastPurchasedAt: '2026-08-01',
        ingredientId: 'sweet-potatoes',
        shoppingCategoryId: 'produce',
      }],
    })
    const clearing = setup(state)

    act(() => clearing.result.current.clearShoppingList())
    const cleared = clearing.updateWithUndo.mock.calls[0][0] as AppState
    expect(cleared.ingredients).toContainEqual(sweetPotatoes)
    expect(cleared.shoppingHistory).toEqual(state.shoppingHistory)
    expect(cleared.manualShoppingItems['2026-08-17']).toBeUndefined()

    const readding = setup(cleared)
    act(() => readding.result.current.addHistoryItemToShopping('Sweet potatoes', 'produce'))
    const readded = readding.update.mock.calls[0][0] as AppState
    expect(readded.ingredients.filter(({ id }) => id === 'sweet-potatoes')).toHaveLength(1)
    expect(readded.manualShoppingItems['2026-08-17'][0]).toMatchObject({
      ingredientId: 'sweet-potatoes',
      shoppingCategoryId: 'produce',
      unit: 'each',
    })
  })

  it('does not clear an empty list or clear after confirmation is cancelled', () => {
    const empty = setup()
    act(() => empty.result.current.clearShoppingList())
    expect(empty.updateWithUndo).not.toHaveBeenCalled()

    const populated = setup(createAppState({ manualShoppingItems: {
      '2026-08-17': [{ id: 'manual', name: 'Bagels', checked: false }],
    } }))
    vi.mocked(window.confirm).mockReturnValue(false)
    act(() => populated.result.current.clearShoppingList())
    expect(populated.updateWithUndo).not.toHaveBeenCalled()
  })

  it('safely handles unavailable state and missing manual targets', () => {
    const unavailable = setup(null)
    act(() => unavailable.result.current.addManualShoppingItem('Milk'))
    expect(unavailable.update).not.toHaveBeenCalled()

    const available = setup()
    act(() => available.result.current.toggleManualShoppingItem('missing'))
    expect(available.update).not.toHaveBeenCalled()
  })
})
