import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { ensureCatalogIngredient, findIngredientByName } from './ingredientCatalog'

const ingredients: Ingredient[] = [
  { id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null, shoppingCategoryId: null },
]

describe('ingredient catalog', () => {
  it('finds and reuses ingredients by normalized name', () => {
    expect(findIngredientByName(ingredients, '  MILK ')).toBe(ingredients[0])

    const result = ensureCatalogIngredient(ingredients, ' milk ')
    expect(result.ingredients).toBe(ingredients)
    expect(result.ingredient).toBe(ingredients[0])
  })

  it('fills a missing category when a categorized history item is linked', () => {
    const result = ensureCatalogIngredient(ingredients, 'Milk', 'dairy')

    expect(result.ingredient).toMatchObject({ id: 'milk', shoppingCategoryId: 'dairy' })
    expect(result.ingredients).toEqual([
      expect.objectContaining({ id: 'milk', shoppingCategoryId: 'dairy' }),
    ])
    expect(ingredients[0].shoppingCategoryId).toBeNull()
  })

  it('creates a durable ingredient and avoids id collisions', () => {
    const result = ensureCatalogIngredient([
      ...ingredients,
      { id: 'sweet-potatoes', name: 'Legacy item', unit: 'each', proteinCategoryId: null, shoppingCategoryId: null },
    ], 'Sweet potatoes', 'produce')

    expect(result.ingredient).toEqual({
      id: 'sweet-potatoes-2',
      name: 'Sweet potatoes',
      unit: 'each',
      proteinCategoryId: null,
      shoppingCategoryId: 'produce',
    })
    expect(result.ingredients).toHaveLength(3)
  })
})
