import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import type { AppState } from '../types'
import { useShoppingController } from './useShoppingController'

function setup(state: AppState = createAppState()) {
  const update = vi.fn()
  const updateWithUndo = vi.fn()
  const hook = renderHook(() => useShoppingController({ state, weekDates, update, updateWithUndo }))
  return { ...hook, update }
}

describe('shopping ingredient boundary', () => {
  it('keeps arbitrary shopping text as a manual item instead of creating a recipe ingredient', () => {
    const state = createAppState()
    const { result, update } = setup(state)

    act(() => result.current.addManualShoppingItem('  Paper towels  '))

    const next = update.mock.calls[0][0] as AppState
    expect(next.ingredients).toEqual(state.ingredients)
    expect(next.manualShoppingItems['2026-08-17']).toContainEqual(expect.objectContaining({
      name: 'Paper towels',
      ingredientId: null,
      checked: false,
    }))
  })

  it('still links an exact existing ingredient without duplicating the catalog record', () => {
    const state = createAppState()
    const { result, update } = setup(state)

    act(() => result.current.addManualShoppingItem('Milk'))

    const next = update.mock.calls[0][0] as AppState
    expect(next.ingredients).toEqual(state.ingredients)
    expect(next.manualShoppingItems['2026-08-17']).toContainEqual(expect.objectContaining({
      name: 'Milk',
      ingredientId: 'milk',
      checked: false,
    }))
  })
})
