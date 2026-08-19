import { describe, expect, it } from 'vitest'
import { normalizeRecipeUrl } from './recipeDetails'

describe('normalizeRecipeUrl', () => {
  it('allows only http and https URLs and supplies a missing scheme', () => {
    expect(normalizeRecipeUrl(' example.com/meal ')).toBe('https://example.com/meal')
    expect(normalizeRecipeUrl('http://example.com/meal')).toBe('http://example.com/meal')
    expect(normalizeRecipeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeRecipeUrl('not a url')).toBeNull()
    expect(normalizeRecipeUrl('  ')).toBe('')
  })
})
