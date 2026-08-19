import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seedProteinCategories } from '../data'
import type { Ingredient, Meal } from '../types'
import { getMealProteinCategories, MealProteinDots, ProteinDot } from './mealProtein'

const ingredients: Ingredient[] = [
  { id: 'chicken-breast', name: 'Chicken breast', unit: 'lb', proteinCategoryId: 'chicken' },
  { id: 'shrimp', name: 'Shrimp', unit: 'lb', proteinCategoryId: 'seafood' },
  { id: 'rice', name: 'Rice', unit: 'cup', proteinCategoryId: null },
]

const meal: Meal = {
  id: 'surf-and-turf',
  name: 'Surf and turf',
  type: 'Dinner',
  proteinCategoryOverrideId: null,
  ingredients: [
    { ingredientId: 'chicken-breast', quantity: 1 },
    { ingredientId: 'shrimp', quantity: 1 },
    { ingredientId: 'chicken-breast', quantity: 1 },
  ],
}

describe('meal protein categories', () => {
  it('derives unique categories in ingredient order', () => {
    expect(getMealProteinCategories(meal, ingredients, seedProteinCategories).map(({ id }) => id))
      .toEqual(['chicken', 'seafood'])
  })

  it('uses an explicit override instead of ingredient categories', () => {
    expect(getMealProteinCategories(
      { ...meal, proteinCategoryOverrideId: 'beef' },
      ingredients,
      seedProteinCategories,
    ).map(({ id }) => id)).toEqual(['beef'])
  })

  it('ignores missing overrides and missing ingredients', () => {
    expect(getMealProteinCategories(
      { ...meal, proteinCategoryOverrideId: 'missing' },
      ingredients,
      seedProteinCategories,
    )).toEqual([])
  })

  it('renders derived dots and a fallback None dot', () => {
    const { rerender } = render(
      <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={seedProteinCategories} />,
    )
    expect(screen.getByLabelText('Chicken')).toBeInTheDocument()
    expect(screen.getByLabelText('Seafood')).toBeInTheDocument()

    rerender(
      <MealProteinDots
        meal={{ ...meal, ingredients: [{ ingredientId: 'rice', quantity: 1 }] }}
        ingredients={ingredients}
        proteinCategories={seedProteinCategories}
      />,
    )
    expect(screen.getByLabelText('None')).toBeInTheDocument()
  })

  it('renders a safe fallback dot without a category', () => {
    render(<ProteinDot category={undefined} />)
    expect(screen.getByLabelText('None')).toHaveStyle({ backgroundColor: '#6f8f72' })
  })
})
