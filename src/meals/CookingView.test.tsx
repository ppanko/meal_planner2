import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import { CookingView } from './CookingView'

describe('CookingView', () => {
  it('presents recipe details as interactive cooking checklists', async () => {
    const state = createAppState()
    const meal = {
      ...state.meals[0],
      recipeUrl: 'example.com/pancakes',
      notes: 'Keep the first batch warm.\nServe immediately.',
      instructions: ['Whisk the batter.', 'Cook until golden.'],
    }
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CookingView meal={meal} ingredients={state.ingredients} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: meal.name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open original recipe/ })).toHaveAttribute('href', 'https://example.com/pancakes')
    expect(screen.getByText(/Keep the first batch warm/)).toBeInTheDocument()
    expect(screen.getByText('Whisk the batter.')).toBeInTheDocument()

    const ingredientCheckbox = screen.getByRole('checkbox', { name: /1.5 cup Flour/ })
    const stepCheckbox = screen.getByRole('checkbox', { name: /Whisk the batter/ })
    await user.click(ingredientCheckbox)
    await user.click(stepCheckbox)
    expect(ingredientCheckbox).toBeChecked()
    expect(stepCheckbox).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Finish cooking' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('alphabetizes the ingredient checklist while preserving cooking-step order', () => {
    const state = createAppState()
    const ingredients = [
      { id: 'zucchini', name: 'Zucchini', unit: 'each', proteinCategoryId: null },
      { id: 'apple', name: 'Apple', unit: 'each', proteinCategoryId: null },
    ]
    const meal = {
      ...state.meals[0],
      ingredients: [
        { ingredientId: 'zucchini', quantity: 1 },
        { ingredientId: 'apple', quantity: 2 },
      ],
      instructions: ['Second alphabetically', 'First alphabetically'],
    }
    const { container } = render(<CookingView meal={meal} ingredients={ingredients} onClose={vi.fn()} />)

    expect(Array.from(container.querySelectorAll('.cooking-checklist label'), (item) => item.textContent?.trim())).toEqual([
      '2 each Apple',
      '1 each Zucchini',
    ])
    expect(Array.from(container.querySelectorAll('.cooking-steps li'), (item) => item.textContent?.replace(/^\d+/, '').trim())).toEqual([
      'Second alphabetically',
      'First alphabetically',
    ])
  })

  it('handles recipes without steps and never renders unsafe source links', () => {
    const state = createAppState()
    const onClose = vi.fn()
    const { container } = render(<CookingView meal={{ ...state.meals[0], recipeUrl: 'javascript:alert(1)', instructions: [] }} ingredients={state.ingredients} onClose={onClose} />)

    expect(screen.getByText(/No cooking steps have been added/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalled()
  })
})
