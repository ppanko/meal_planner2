import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import { useMealsController } from './useMealsController'

describe('useMealsController ingredient editing', () => {
  it('updates an ingredient in place and rejects a conflicting name', () => {
    const state = createAppState()
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

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: state.ingredients.map((ingredient) => ingredient.id === 'eggs'
        ? { ...eggs, name: 'Large eggs', unit: 'dozen', shoppingCategoryId: 'dairy' }
        : ingredient),
    }))

    update.mockClear()
    act(() => result.current.updateIngredient({ ...eggs, name: 'Milk' }))
    expect(update).not.toHaveBeenCalled()
  })
})
