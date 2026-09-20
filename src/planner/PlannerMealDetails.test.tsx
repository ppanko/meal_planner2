import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import { PlannerMealDetails } from './PlannerMealDetails'

const state = createAppState()
const meal = state.meals[0]

describe('PlannerMealDetails', () => {
  it('shows ingredients and a clickable recipe URL when one is present', () => {
    const recipeUrl = 'https://example.com/pancakes'
    render(
      <PlannerMealDetails
        meal={{ ...meal, recipeUrl }}
        ingredients={state.ingredients}
        onClose={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: `${meal.name} meal details` })
    expect(within(dialog).getByText('1.5 cup Flour')).toBeInTheDocument()
    const link = within(dialog).getByRole('link', { name: recipeUrl })
    expect(link).toHaveAttribute('href', recipeUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('does not show a recipe URL section when the meal has no URL', () => {
    render(
      <PlannerMealDetails
        meal={{ ...meal, recipeUrl: '' }}
        ingredients={state.ingredients}
        onClose={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: `${meal.name} meal details` })
    expect(within(dialog).queryByText('Recipe URL')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
  })
})
