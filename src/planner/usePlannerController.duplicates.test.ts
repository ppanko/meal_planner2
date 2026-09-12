import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

describe('duplicate planner meals', () => {
  it('removes only one occurrence when the same meal is planned twice', () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos', 'tacos'] } },
      plannerNotes: { '2026-08-17': { Dinner: 'Use salsa' } },
    })
    const updateWithUndo = vi.fn()
    const { result } = renderHook(() => usePlannerController({
      state,
      weekOffset: 0,
      weekDates,
      setView: vi.fn(),
      update: vi.fn(),
      updateWithUndo,
    }))

    act(() => result.current.removeMeal('2026-08-17', 'Dinner', 'tacos'))

    const next = updateWithUndo.mock.calls[0][0] as AppState
    expect(next.planner['2026-08-17'].Dinner).toEqual(['tacos'])
    expect(next.plannerNotes['2026-08-17']).toEqual({ Dinner: 'Use salsa' })
  })
})
