import { describe, expect, it } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import { getPlannerRows, getSlotMealIds } from './plannerUtils'

describe('planner utilities', () => {
  it('returns the three default rows followed by week-specific rows', () => {
    const state = createAppState({
      plannerRowsByWeek: {
        '2026-08-17': [{ id: 'snack', label: 'Snack' }],
        '2026-08-24': [{ id: 'other', label: 'Other week' }],
      },
    })

    expect(getPlannerRows(state, weekDates)).toEqual([
      { id: 'Breakfast', label: 'Breakfast' },
      { id: 'Lunch', label: 'Lunch' },
      { id: 'Dinner', label: 'Dinner' },
      { id: 'snack', label: 'Snack' },
    ])
  })

  it('gets a slot or returns a safe empty array', () => {
    const planner = { '2026-08-17': { Dinner: ['tacos'] } }
    expect(getSlotMealIds(planner, '2026-08-17', 'Dinner')).toEqual(['tacos'])
    expect(getSlotMealIds(planner, '2026-08-18', 'Dinner')).toEqual([])
  })
})
