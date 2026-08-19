import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...original,
    useSensor: vi.fn((sensor, options) => ({ sensor, options })),
    useSensors: vi.fn((...sensors) => sensors),
  }
})

import { createAppState, weekDates } from '../test/fixtures'
import type { AppState } from '../types'
import { usePlannerController } from './usePlannerController'

function setup(state: AppState | null = createAppState(), weekOffset = 0) {
  const update = vi.fn()
  const updateWithUndo = vi.fn()
  const setView = vi.fn()
  const hook = renderHook(() => usePlannerController({
    state,
    weekOffset,
    weekDates,
    setView,
    update,
    updateWithUndo,
  }))
  return { ...hook, update, updateWithUndo, setView }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 19, 12))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000030')
})

describe('usePlannerController week copying', () => {
  it('finds populated source weeks, excludes the target, and prefers last week', () => {
    const state = createAppState({
      planner: {
        '2026-08-10': { Dinner: ['tacos'] },
        '2026-08-17': { Dinner: ['spaghetti'] },
      },
      plannerNotes: { '2026-08-03': { Dinner: 'Note only' } },
      plannerRowsByWeek: { '2026-07-27': [{ id: 'snack', label: 'Snack' }] },
    })
    const { result } = setup(state)

    expect(result.current.copyableWeekKeys).toEqual([
      '2026-08-10', '2026-08-03', '2026-07-27',
    ])
    act(() => result.current.openCopyWeek())
    expect(result.current.showCopyWeek).toBe(true)
    expect(result.current.copySourceWeekKey).toBe('2026-08-10')

    act(() => result.current.closeCopyWeek())
    expect(result.current.showCopyWeek).toBe(false)
    expect(result.current.copySourceWeekKey).toBe('')
  })

  it('copies meals, notes, and remapped custom rows while resetting target purchases', () => {
    const state = createAppState({
      planner: {
        '2026-08-10': { Dinner: ['tacos'], 'custom-old': ['pancakes'] },
        '2026-08-17': { Dinner: ['spaghetti'] },
        '2026-08-24': { Dinner: ['chicken-rice'] },
      },
      plannerNotes: {
        '2026-08-10': { Dinner: 'Source', 'custom-old': 'Snack note' },
        '2026-08-17': { Dinner: 'Replace me' },
      },
      plannerRowsByWeek: {
        '2026-08-10': [{ id: 'custom-old', label: 'Snack' }],
        '2026-08-17': [{ id: 'custom-target', label: 'Old row' }],
      },
      shoppingPurchasesByWeek: {
        '2026-08-17': { eggs: 2 },
        '2026-08-24': { milk: 1 },
      },
      shoppingDismissedByWeek: {
        '2026-08-17': { eggs: 2 },
        '2026-08-24': { milk: 1 },
      },
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.copyWeek('2026-08-10'))

    const next = updateWithUndo.mock.calls[0][0] as AppState
    const copiedRowId = 'custom-00000000-0000-4000-8000-000000000030'
    expect(next.planner['2026-08-17']).toEqual({
      Dinner: ['tacos'],
      [copiedRowId]: ['pancakes'],
    })
    expect(next.plannerNotes['2026-08-17']).toEqual({
      Dinner: 'Source',
      [copiedRowId]: 'Snack note',
    })
    expect(next.plannerRowsByWeek['2026-08-17']).toEqual([{ id: copiedRowId, label: 'Snack' }])
    expect(next.shoppingPurchasesByWeek).toEqual({ '2026-08-24': { milk: 1 } })
    expect(next.shoppingDismissedByWeek).toEqual({ '2026-08-24': { milk: 1 } })
    expect(next.planner['2026-08-24']).toEqual({ Dinner: ['chicken-rice'] })
    expect(updateWithUndo.mock.calls[0][1]).toBe('Copied Aug 10 – Aug 16')
  })

  it('does not copy an empty source or the target week into itself', () => {
    const { result, updateWithUndo } = setup()
    act(() => result.current.copyWeek(''))
    act(() => result.current.copyWeek('2026-08-17'))
    expect(updateWithUndo).not.toHaveBeenCalled()
  })
})

describe('usePlannerController meal placement', () => {
  it('tracks the active dragged meal and accepts valid slot drops', () => {
    const state = createAppState()
    const meal = state.meals.find(({ id }) => id === 'tacos')!
    const { result, update } = setup(state)

    act(() => result.current.handleDragStart({ active: { id: 'meal-tacos' } }))
    expect(result.current.activeMeal).toBe(meal)

    act(() => result.current.handleDragEnd({
      active: { id: 'meal-tacos' },
      over: { id: 'slot:2026-08-17:Dinner' },
    } as never))
    expect(result.current.activeMeal).toBeNull()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
    }))
  })

  it('rejects malformed drops, unknown meals and rows, and full slots', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['a', 'b', 'c'] } },
    })
    const { result, update } = setup(state)
    const drop = (active: string, over: string | null) => act(() => result.current.handleDragEnd({
      active: { id: active },
      over: over ? { id: over } : null,
    } as never))

    drop('meal-tacos', null)
    drop('meal-tacos', 'other')
    drop('meal-missing', 'slot:2026-08-17:Dinner')
    drop('meal-tacos', 'slot:2026-08-17:Missing')
    drop('meal-tacos', 'slot:2026-08-17:Dinner')
    expect(update).not.toHaveBeenCalled()
  })

  it('adds to a chosen slot up to its capacity', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['a', 'b'] } },
    })
    const meal = state.meals[0]
    const { result, update } = setup(state)

    act(() => result.current.addMealToSlot('2026-08-17', 'Dinner', meal))
    expect(update.mock.calls[0][0].planner['2026-08-17'].Dinner).toEqual(['a', 'b', meal.id])

    update.mockClear()
    const fullState = createAppState({ planner: { '2026-08-17': { Dinner: ['a', 'b', 'c'] } } })
    const full = setup(fullState)
    act(() => full.result.current.addMealToSlot('2026-08-17', 'Dinner', meal))
    expect(full.update).not.toHaveBeenCalled()
  })

  it('adds a tapped meal to the first available row and returns to planner', () => {
    const state = createAppState({
      planner: {
        '2026-08-17': {
          Breakfast: ['a', 'b', 'c'],
          Lunch: ['a', 'b'],
        },
      },
    })
    const meal = state.meals[0]
    const { result, update, setView } = setup(state)

    act(() => result.current.addMeal(meal))
    expect(update.mock.calls[0][0].planner['2026-08-17'].Lunch).toEqual(['a', 'b', meal.id])
    expect(setView).toHaveBeenCalledWith('planner')
  })

  it('removes every occurrence of a meal and clears a now-empty slot note', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos', 'tacos'] } },
      plannerNotes: { '2026-08-17': { Dinner: 'Use salsa', Lunch: 'Keep' } },
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.removeMeal('2026-08-17', 'Dinner', 'tacos'))
    expect(updateWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        planner: { '2026-08-17': { Dinner: [] } },
        plannerNotes: { '2026-08-17': { Lunch: 'Keep' } },
      }),
      'Removed planned meal',
    )
  })
})

describe('usePlannerController notes and custom rows', () => {
  it('trims notes and removes blank notes without disturbing siblings', () => {
    const state = createAppState({
      plannerNotes: { '2026-08-17': { Lunch: 'Keep' } },
    })
    const { result, update } = setup(state)

    act(() => result.current.updatePlannerNote('2026-08-17', 'Dinner', '  New note  '))
    expect(update.mock.calls[0][0].plannerNotes['2026-08-17']).toEqual({
      Lunch: 'Keep', Dinner: 'New note',
    })

    act(() => result.current.updatePlannerNote('2026-08-17', 'Lunch', '  '))
    expect(update.mock.calls[1][0].plannerNotes).toEqual({})
  })

  it('adds named and sequential default custom rows', () => {
    const state = createAppState({
      plannerRowsByWeek: { '2026-08-17': [{ id: 'old', label: 'Extra meal' }] },
    })
    const { result, update } = setup(state)

    act(() => result.current.addPlannerRow('  Late snack '))
    expect(update.mock.calls[0][0].plannerRowsByWeek['2026-08-17'][1]).toMatchObject({
      label: 'Late snack',
    })

    act(() => result.current.addPlannerRow(''))
    expect(update.mock.calls[1][0].plannerRowsByWeek['2026-08-17'][1]).toMatchObject({
      label: 'Extra meal 2',
    })
  })

  it('removes a custom row, its meals, and notes after confirmation', () => {
    const state = createAppState({
      plannerRowsByWeek: { '2026-08-17': [{ id: 'snack', label: 'Snack' }] },
      planner: {
        '2026-08-17': { snack: ['tacos'], Dinner: ['spaghetti'] },
        '2026-08-18': { snack: ['pancakes'] },
      },
      plannerNotes: {
        '2026-08-17': { snack: 'Remove', Dinner: 'Keep' },
        '2026-08-18': { snack: 'Remove' },
      },
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.removePlannerRow('snack'))
    const next = updateWithUndo.mock.calls[0][0] as AppState
    expect(next.plannerRowsByWeek).toEqual({})
    expect(next.planner['2026-08-17']).toEqual({ Dinner: ['spaghetti'] })
    expect(next.planner['2026-08-18']).toEqual({})
    expect(next.plannerNotes).toEqual({ '2026-08-17': { Dinner: 'Keep' } })
    expect(updateWithUndo.mock.calls[0][1]).toBe('Removed Snack row')
  })

  it('respects cancellation when removing a populated custom row', () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    const state = createAppState({
      plannerRowsByWeek: { '2026-08-17': [{ id: 'snack', label: 'Snack' }] },
      planner: { '2026-08-17': { snack: ['tacos'] } },
    })
    const { result, updateWithUndo } = setup(state)
    act(() => result.current.removePlannerRow('snack'))
    expect(updateWithUndo).not.toHaveBeenCalled()
  })

  it('clears only the active week and its custom rows after confirmation', () => {
    const state = createAppState({
      planner: {
        '2026-08-17': { Dinner: ['tacos'] },
        '2026-08-24': { Dinner: ['spaghetti'] },
      },
      plannerNotes: {
        '2026-08-17': { Dinner: 'Clear' },
        '2026-08-24': { Dinner: 'Keep' },
      },
      plannerRowsByWeek: {
        '2026-08-17': [{ id: 'snack', label: 'Snack' }],
        '2026-08-24': [{ id: 'other', label: 'Other' }],
      },
      shoppingDismissedByWeek: {
        '2026-08-17': { eggs: 2 },
        '2026-08-24': { milk: 1 },
      },
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.clearWeek())
    const next = updateWithUndo.mock.calls[0][0] as AppState
    expect(next.planner).toEqual({ '2026-08-24': { Dinner: ['spaghetti'] } })
    expect(next.plannerNotes).toEqual({ '2026-08-24': { Dinner: 'Keep' } })
    expect(next.plannerRowsByWeek).toEqual({ '2026-08-24': [{ id: 'other', label: 'Other' }] })
    expect(next.shoppingDismissedByWeek).toEqual({ '2026-08-24': { milk: 1 } })
  })

  it('safely ignores actions without state', () => {
    const { result, update, updateWithUndo } = setup(null)
    act(() => {
      result.current.addPlannerRow('Row')
      result.current.clearWeek()
      result.current.addMeal(createAppState().meals[0])
    })
    expect(update).not.toHaveBeenCalled()
    expect(updateWithUndo).not.toHaveBeenCalled()
  })
})
