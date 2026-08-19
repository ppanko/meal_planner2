import { seedState } from '../data'
import type { AppState } from '../types'

export function createAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...JSON.parse(JSON.stringify(seedState)) as AppState,
    ...overrides,
  }
}

export const monday = new Date(2026, 7, 17)

export const weekDates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(monday)
  date.setDate(monday.getDate() + index)
  return date
})
