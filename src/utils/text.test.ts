import { describe, expect, it } from 'vitest'
import { formatQuantity, slug } from './text'

describe('formatQuantity', () => {
  it.each([
    [2, '2'],
    [1.5, '1.5'],
    [1.25, '1.25'],
    [1.2, '1.2'],
    [0, '0'],
  ])('formats %s as %s', (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected)
  })
})

describe('slug', () => {
  it('normalizes spaces, punctuation, and case', () => {
    expect(slug('  Chicken & Rice!  ')).toBe('chicken-rice')
  })

  it('collapses repeated separators and trims them', () => {
    expect(slug('--One___Two---')).toBe('one-two')
  })

  it('returns an empty string when no ASCII letters or digits remain', () => {
    expect(slug(' *** ')).toBe('')
  })
})
