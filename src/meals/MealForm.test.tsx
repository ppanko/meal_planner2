import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealForm } from './MealForm'

const state = createAppState()

function props(overrides: Record<string, unknown> = {}) {
  return {
    meal: null,
    meals: state.meals,
    ingredients: state.ingredients,
    proteinCategories: seedProteinCategories,
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onCreateIngredient: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onCreateProteinCategory: vi.fn(),
    onDeleteProteinCategory: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000040')
})

describe('MealForm', () => {
  it('creates a meal with a newly created ingredient', async () => {
    const callbacks = props({ meals: [], ingredients: state.ingredients.slice(0, 2) })
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)

    await user.type(screen.getByLabelText('Name'), '  Brunch Bowl  ')
    await user.selectOptions(screen.getByLabelText('Type'), 'Lunch')
    await user.type(screen.getByPlaceholderText('New ingredient'), '  Greek Yogurt ')
    await user.selectOptions(screen.getByLabelText('New ingredient protein category'), 'chicken')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(callbacks.onCreateIngredient).toHaveBeenCalledWith({
      id: 'greek-yogurt',
      name: 'Greek Yogurt',
      unit: 'each',
      proteinCategoryId: 'chicken',
    })

    await user.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(callbacks.onSave).toHaveBeenCalledWith({
      id: '00000000-0000-4000-8000-000000000040',
      name: 'Brunch Bowl',
      type: 'Lunch',
      proteinCategoryOverrideId: null,
      ingredients: [{ ingredientId: 'greek-yogurt', quantity: 1 }],
    }, undefined)
  })

  it('edits ingredient quantities and passes the original id on save', async () => {
    const meal = state.meals[0]
    const callbacks = props({ meal })
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Edited Pancakes')
    const quantity = screen.getAllByRole('spinbutton')[0]
    await user.clear(quantity)
    await user.type(quantity, '3')
    await user.click(screen.getByRole('button', { name: 'Save meal' }))

    expect(callbacks.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: meal.id,
        name: 'Edited Pancakes',
        ingredients: expect.arrayContaining([expect.objectContaining({ quantity: 3 })]),
      }),
      meal.id,
    )
  })

  it('does not save without a name and at least one ingredient', async () => {
    const callbacks = props({ meals: [], ingredients: [] })
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)
    await user.click(screen.getByRole('button', { name: 'Save meal' }))
    expect(callbacks.onSave).not.toHaveBeenCalled()
  })

  it('creates new protein categories and reuses an existing slug', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)

    const input = screen.getByPlaceholderText('New protein category')
    await user.type(input, 'Turkey')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(callbacks.onCreateProteinCategory).toHaveBeenCalledWith({
      id: 'turkey', name: 'Turkey', color: '#8a7f70',
    })

    await user.type(input, 'Chicken')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(callbacks.onCreateProteinCategory).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Protein')).toHaveValue('chicken')
  })

  it('manages only unused ingredients and categories and handles cancellation', async () => {
    const orphan = { id: 'orphan', name: 'Orphan', unit: 'each', proteinCategoryId: null }
    const callbacks = props({
      ingredients: [...state.ingredients, orphan],
      proteinCategories: [...seedProteinCategories, { id: 'unused', name: 'Unused', color: '#fff' }],
    })
    const user = userEvent.setup()
    render(<MealForm {...callbacks} />)

    await user.click(screen.getByRole('button', { name: /Manage unused ingredients/ }))
    const orphanRow = screen.getByText('Orphan').closest('.ingredient-manager-row') as HTMLElement
    await user.click(within(orphanRow).getByRole('button', { name: 'Delete Orphan' }))
    expect(callbacks.onDeleteIngredient).toHaveBeenCalledWith('orphan')

    await user.click(screen.getByRole('button', { name: /Manage protein categories/ }))
    await user.click(screen.getByRole('button', { name: 'Delete Unused protein category' }))
    expect(callbacks.onDeleteProteinCategory).toHaveBeenCalledWith('unused')
    const chickenManagerDot = screen.getAllByLabelText('Chicken')
      .find((element) => element.closest('.protein-category-manager-row'))!
    expect(chickenManagerDot.closest('.ingredient-manager-row')).toHaveTextContent('In use')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(callbacks.onCancel).toHaveBeenCalled()
  })
})
