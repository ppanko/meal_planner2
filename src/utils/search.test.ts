import { describe, expect, it } from 'vitest'
import { matchSearch, rankSearch } from './search'

describe('search matching', () => {
  it('matches words regardless of query order', () => {
    expect(matchSearch('Chicken Tacos', 'taco chick')).toBe(true)
    expect(matchSearch('Chicken Tacos', 'chick taco')).toBe(true)
  })

  it('requires every query token to match', () => {
    expect(matchSearch('Chicken Tacos', 'chick rice')).toBe(false)
  })

  it('ranks stronger matches ahead of looser matches', () => {
    expect(rankSearch('Chicken', 'chicken')).toBeLessThan(rankSearch('Chicken Tacos', 'chicken'))
    expect(rankSearch('Chicken Tacos', 'taco chick')).toBeLessThan(rankSearch('Spicy Chicken Taco Bowl', 'taco chick'))
  })
})
