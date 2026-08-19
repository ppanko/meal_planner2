import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealForm } from './MealForm'

const state = createAppState()

function props(overrides: Record<string, unknown> = {}) {
  return {
    meal: null,
    ingredients: state.ingredients,
    proteinCategories: seedProteinCategories,
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000040')
})

describe('MealForm', () => {
  it('creates a meal with recipe details and ordered cooking steps', async () => {
    const callbacks = props({ ingredients: state.ingredients.slice(0, 2) })
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)

    await user.type(screen.getByLabelText('Name'), '  Brunch Bowl  ')
    await user.selectOptions(screen.getByLabelText('Type'), 'Lunch')
    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    await user.selectOptions(screen.getByLabelText('Ingredient 1'), 'milk')
    await user.type(screen.getByLabelText('Recipe URL'), 'example.com/brunch')
    await user.type(screen.getByLabelText('Notes'), '  Use oat milk.  ')
    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.type(screen.getByLabelText('Cooking step 1'), '  Mix everything.  ')
    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.click(screen.getByRole('button', { name: 'Save meal' }))

    expect(callbacks.onSave).toHaveBeenCalledWith({
      id: '00000000-0000-4000-8000-000000000040',
      name: 'Brunch Bowl',
      type: 'Lunch',
      proteinCategoryOverrideId: null,
      ingredients: [{ ingredientId: 'milk', quantity: 1 }],
      recipeUrl: 'https://example.com/brunch',
      notes: 'Use oat milk.',
      instructions: ['Mix everything.'],
    }, undefined)
  })

  it('edits existing details and passes the original id on save', async () => {
    const meal = {
      ...state.meals[0],
      recipeUrl: 'https://example.com/pancakes',
      notes: 'Keep warm',
      instructions: ['Mix', 'Cook'],
    }
    const callbacks = props({ meal })
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Edited Pancakes')
    const quantity = screen.getByLabelText('Quantity 1')
    await user.clear(quantity)
    await user.type(quantity, '3')
    await user.clear(screen.getByLabelText('Cooking step 2'))
    await user.type(screen.getByLabelText('Cooking step 2'), 'Flip once')
    await user.click(screen.getByRole('button', { name: 'Save meal' }))

    expect(callbacks.onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: meal.id,
      name: 'Edited Pancakes',
      recipeUrl: 'https://example.com/pancakes',
      notes: 'Keep warm',
      instructions: ['Mix', 'Flip once'],
      ingredients: expect.arrayContaining([expect.objectContaining({ quantity: 3 })]),
    }), meal.id)
  })

  it('validates required meal fields and rejects unsafe recipe URLs', async () => {
    const emptyCallbacks = props({ ingredients: [] })
    const user = userEvent.setup()
    const { unmount } = render(<MealForm {...emptyCallbacks} />)

    await user.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add a name')
    expect(emptyCallbacks.onSave).not.toHaveBeenCalled()
    unmount()

    const callbacks = props({ ingredients: state.ingredients.slice(0, 1) })
    render(<MealForm {...callbacks} />)
    await user.type(screen.getByLabelText('Name'), 'Unsafe meal')
    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    await user.type(screen.getByLabelText('Recipe URL'), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(screen.getByRole('alert')).toHaveTextContent('valid http or https')
    expect(callbacks.onSave).not.toHaveBeenCalled()
  })

  it('keeps catalog management outside the form and supports closing the dialog', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    const { container } = render(<MealForm {...callbacks} />)

    expect(screen.queryByText('New ingredient')).not.toBeInTheDocument()
    expect(screen.queryByText('Manage protein categories')).not.toBeInTheDocument()
    expect(screen.getByText('Manage the library from the Meals tab')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(callbacks.onCancel).toHaveBeenCalledTimes(3)
  })
})
