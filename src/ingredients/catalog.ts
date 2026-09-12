import type { Ingredient } from '../types'
import { slug } from '../utils/text'

export type IngredientDraft = Omit<Ingredient, 'id'>

export function findIngredientByName(ingredients: Ingredient[], name: string) {
  const normalized = name.trim().toLocaleLowerCase()
  return ingredients.find((ingredient) => ingredient.name.trim().toLocaleLowerCase() === normalized)
}

export function buildIngredient(ingredients: Ingredient[], draft: IngredientDraft): Ingredient {
  const name = draft.name.trim()
  const baseId = slug(name) || 'ingredient'
  const usedIds = new Set(ingredients.map((ingredient) => ingredient.id))
  let id = baseId
  let suffix = 2

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  return {
    id,
    name,
    unit: draft.unit.trim() || 'each',
    proteinCategoryId: draft.proteinCategoryId || null,
    shoppingCategoryId: draft.shoppingCategoryId || null,
  }
}
