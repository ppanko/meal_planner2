import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateKey, formatRange, getWeekDates, getWeekDatesForDateKey } from './dates'

afterEach(() => vi.useRealTimers())

describe('date helpers', () => {
  it('uses local calendar components for date keys', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it.each([
    ['2026-08-17', '2026-08-17'],
    ['2026-08-19', '2026-08-17'],
    ['2026-08-23', '2026-08-17'],
  ])('finds the Monday containing %s', (input, expectedMonday) => {
    expect(dateKey(getWeekDatesForDateKey(input)[0])).toBe(expectedMonday)
  })

  it('returns seven consecutive days, including across month boundaries', () => {
    expect(getWeekDatesForDateKey('2026-09-01').map(dateKey)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ])
  })

  it('applies week offsets relative to the current Monday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 19, 12))

    expect(getWeekDates(-1).map(dateKey)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ])
  })

  it('handles Sunday as the final day of the current week', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 23, 12))
    expect(dateKey(getWeekDates(0)[0])).toBe('2026-08-17')
  })

  it('formats a human-readable date range', () => {
    expect(formatRange(getWeekDatesForDateKey('2026-08-19'))).toBe('Aug 17 – Aug 23')
  })
})
