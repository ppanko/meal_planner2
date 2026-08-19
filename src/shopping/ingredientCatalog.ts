import type { Ingredient } from '../types'
import { slug } from '../utils/text'

export function findIngredientByName(ingredients: Ingredient[], name: string) {
  const normalized = name.trim().toLowerCase()
  return ingredients.find((ingredient) => ingredient.name.trim().toLowerCase() === normalized)
}

export function ensureCatalogIngredient(
  ingredients: Ingredient[],
  name: string,
  shoppingCategoryId: string | null = null,
): { ingredients: Ingredient[]; ingredient: Ingredient } {
  const existing = findIngredientByName(ingredients, name)
  if (existing) {
    if (!existing.shoppingCategoryId && shoppingCategoryId) {
      const ingredient = { ...existing, shoppingCategoryId }
      return {
        ingredients: ingredients.map((item) => item.id === existing.id ? ingredient : item),
        ingredient,
      }
    }
    return { ingredients, ingredient: existing }
  }

  const trimmed = name.trim()
  const baseId = slug(trimmed) || 'shopping-item'
  const usedIds = new Set(ingredients.map((ingredient) => ingredient.id))
  let id = baseId
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  const ingredient: Ingredient = {
    id,
    name: trimmed,
    unit: 'each',
    proteinCategoryId: null,
    shoppingCategoryId,
  }
  return { ingredients: [...ingredients, ingredient], ingredient }
}
