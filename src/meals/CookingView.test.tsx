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
