import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types'
import { buildIngredient, findIngredientByName } from './catalog'

const ingredients: Ingredient[] = [
  { id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null, shoppingCategoryId: null },
]

describe('ingredient catalog', () => {
  it('finds ingredients by trimmed case-insensitive name', () => {
    expect(findIngredientByName(ingredients, '  MILK ')).toBe(ingredients[0])
    expect(findIngredientByName(ingredients, 'Cream')).toBeUndefined()
  })

  it('builds normalized ingredients without mutating the catalog', () => {
    const ingredient = buildIngredient(ingredients, {
      name: '  Greek yogurt  ',
      unit: '  cup  ',
      proteinCategoryId: null,
      shoppingCategoryId: 'dairy',
    })

    expect(ingredient).toEqual({
      id: 'greek-yogurt',
      name: 'Greek yogurt',
      unit: 'cup',
      proteinCategoryId: null,
      shoppingCategoryId: 'dairy',
    })
    expect(ingredients).toHaveLength(1)
  })

  it('avoids ingredient id collisions', () => {
    const ingredient = buildIngredient([
      ...ingredients,
      { id: 'sweet-potatoes', name: 'Legacy item', unit: 'each', proteinCategoryId: null },
    ], {
      name: 'Sweet potatoes',
      unit: '',
      proteinCategoryId: null,
      shoppingCategoryId: 'produce',
    })

    expect(ingredient).toEqual({
      id: 'sweet-potatoes-2',
      name: 'Sweet potatoes',
      unit: 'each',
      proteinCategoryId: null,
      shoppingCategoryId: 'produce',
    })
  })
})
