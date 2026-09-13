import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import { useMealsController } from './useMealsController'

describe('useMealsController ingredient editing', () => {
  it('updates an ingredient and all linked shopping copies atomically', () => {
    const base = createAppState()
    const state = createAppState({
      manualShoppingItems: {
        '2026-08-17': [
          { id: 'linked-current', name: 'Eggs', checked: false, ingredientId: 'eggs', quantity: 2, unit: 'each', shoppingCategoryId: null },
          { id: 'one-off', name: 'Paper towels', checked: false, ingredientId: null },
        ],
        '2026-08-24': [
          { id: 'linked-other-week', name: 'Eggs', checked: true, ingredientId: 'eggs', quantity: 1, unit: 'each', shoppingCategoryId: null },
        ],
      },
      shoppingHistory: [
        { id: 'history-eggs', name: 'Eggs', lastPurchasedAt: '2026-08-01T00:00:00.000Z', ingredientId: 'eggs', shoppingCategoryId: null },
        { id: 'history-manual', name: 'Paper towels', lastPurchasedAt: '2026-08-02T00:00:00.000Z', ingredientId: null, shoppingCategoryId: null },
      ],
    })
    const update = vi.fn()
    const { result } = renderHook(() => useMealsController({
      state,
      setView: vi.fn(),
      update,
      updateWithUndo: vi.fn(),
    }))
    const eggs = state.ingredients.find((ingredient) => ingredient.id === 'eggs')!

    act(() => result.current.updateIngredient({
      ...eggs,
      name: 'Large eggs',
      unit: 'dozen',
      shoppingCategoryId: 'dairy',
    }))

    expect(update).toHaveBeenCalledTimes(1)
    const next = update.mock.calls[0][0]
    expect(next.ingredients).toEqual(state.ingredients.map((ingredient) => ingredient.id === 'eggs'
      ? { ...eggs, name: 'Large eggs', unit: 'dozen', shoppingCategoryId: 'dairy' }
      : ingredient))
    expect(next.manualShoppingItems['2026-08-17']).toEqual([
      { id: 'linked-current', name: 'Large eggs', checked: false, ingredientId: 'eggs', quantity: 2, unit: 'dozen', shoppingCategoryId: 'dairy' },
      { id: 'one-off', name: 'Paper towels', checked: false, ingredientId: null },
    ])
    expect(next.manualShoppingItems['2026-08-24']).toEqual([
      { id: 'linked-other-week', name: 'Large eggs', checked: true, ingredientId: 'eggs', quantity: 1, unit: 'dozen', shoppingCategoryId: 'dairy' },
    ])
    expect(next.shoppingHistory).toEqual([
      { id: 'history-eggs', name: 'Large eggs', lastPurchasedAt: '2026-08-01T00:00:00.000Z', ingredientId: 'eggs', shoppingCategoryId: 'dairy' },
      { id: 'history-manual', name: 'Paper towels', lastPurchasedAt: '2026-08-02T00:00:00.000Z', ingredientId: null, shoppingCategoryId: null },
    ])
    expect(base.ingredients.find((ingredient) => ingredient.id === 'eggs')?.name).toBe('Eggs')
  })

  it('rejects renaming an ingredient to an existing name', () => {
    const state = createAppState()
    const update = vi.fn()
    const { result } = renderHook(() => useMealsController({
      state,
      setView: vi.fn(),
      update,
      updateWithUndo: vi.fn(),
    }))
    const eggs = state.ingredients.find((ingredient) => ingredient.id === 'eggs')!

    act(() => result.current.updateIngredient({ ...eggs, name: 'Milk' }))

    expect(update).not.toHaveBeenCalled()
  })
})
