import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import type { AppState, Ingredient } from '../types'
import { useShoppingController } from './useShoppingController'

function setup(state: AppState = createAppState()) {
  const update = vi.fn()
  const updateWithUndo = vi.fn()
  const hook = renderHook(() => useShoppingController({ state, weekDates, update, updateWithUndo }))
  return { ...hook, update }
}

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000030')
})

describe('useShoppingController ingredient entry', () => {
  it('adds an existing catalog ingredient as a linked shopping item', () => {
    const state = createAppState({
      ingredients: createAppState().ingredients.map((ingredient) =>
        ingredient.id === 'milk' ? { ...ingredient, shoppingCategoryId: 'dairy' } : ingredient,
      ),
    })
    const { result, update } = setup(state)

    act(() => result.current.addIngredientToShopping('milk'))

    const next = update.mock.calls[0][0] as AppState
    expect(next.manualShoppingItems['2026-08-17']).toEqual([
      expect.objectContaining({
        name: 'Milk',
        ingredientId: 'milk',
        quantity: 1,
        unit: 'cup',
        shoppingCategoryId: 'dairy',
        checked: false,
      }),
    ])
    expect(next.ingredients).toEqual(state.ingredients)
  })

  it('creates a reusable ingredient and adds its linked shopping item in one update', () => {
    const state = createAppState()
    const ingredient: Ingredient = {
      id: 'shallot',
      name: 'Shallot',
      unit: 'each',
      proteinCategoryId: null,
      shoppingCategoryId: 'produce',
    }
    const { result, update } = setup(state)

    act(() => result.current.createIngredientAndAddToShopping(ingredient))

    expect(update).toHaveBeenCalledTimes(1)
    const next = update.mock.calls[0][0] as AppState
    expect(next.ingredients).toEqual([...state.ingredients, ingredient])
    expect(next.manualShoppingItems['2026-08-17']).toEqual([
      expect.objectContaining({
        name: 'Shallot',
        ingredientId: 'shallot',
        quantity: 1,
        unit: 'each',
        shoppingCategoryId: 'produce',
        checked: false,
      }),
    ])
  })

  it('keeps an explicitly manual shopping item out of the ingredient catalog', () => {
    const state = createAppState()
    const { result, update } = setup(state)

    act(() => result.current.addManualShoppingItem('Milk'))

    const next = update.mock.calls[0][0] as AppState
    expect(next.manualShoppingItems['2026-08-17']).toEqual([
      expect.objectContaining({
        name: 'Milk',
        ingredientId: null,
        shoppingCategoryId: null,
      }),
    ])
    expect(next.ingredients).toEqual(state.ingredients)
  })

  it('does not duplicate an active shopping item', () => {
    const state = createAppState({
      manualShoppingItems: {
        '2026-08-17': [{
          id: 'already-needed',
          name: 'Milk',
          checked: false,
          ingredientId: 'milk',
          quantity: 1,
          unit: 'cup',
          shoppingCategoryId: 'dairy',
        }],
      },
    })
    const { result, update } = setup(state)

    act(() => result.current.addIngredientToShopping('milk'))
    act(() => result.current.addManualShoppingItem(' milk '))

    expect(update).not.toHaveBeenCalled()
  })

  it('rejects duplicate reusable ingredients before changing either catalog or list', () => {
    const state = createAppState()
    const duplicate = { ...state.ingredients.find((ingredient) => ingredient.id === 'milk')! }
    const { result, update } = setup(state)

    act(() => result.current.createIngredientAndAddToShopping(duplicate))

    expect(update).not.toHaveBeenCalled()
  })
})
