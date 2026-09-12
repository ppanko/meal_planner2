import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MealForm } from './MealForm'

const ingredients = [
  { id: 'black-beans', name: 'Black Beans', unit: 'can', proteinCategoryId: null },
  { id: 'chicken-breast', name: 'Chicken Breast', unit: 'lb', proteinCategoryId: null },
  { id: 'lime', name: 'Lime', unit: 'each', proteinCategoryId: null },
]

const proteinCategories = [
  { id: 'none', name: 'None', color: '#999999' },
]

describe('MealForm ingredient picker', () => {
  it('adds an empty searchable ingredient row instead of choosing the first ingredient', () => {
    render(
      <MealForm
        meal={null}
        ingredients={ingredients}
        proteinCategories={proteinCategories}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))

    const search = screen.getByRole('combobox', { name: 'Ingredient 1' })
    expect(search).toHaveValue('')
  })

  it('filters ingredient options as the user types and selects a result', () => {
    render(
      <MealForm
        meal={null}
        ingredients={ingredients}
        proteinCategories={proteinCategories}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    const search = screen.getByRole('combobox', { name: 'Ingredient 1' })
    fireEvent.change(search, { target: { value: 'chick' } })

    expect(screen.getByRole('option', { name: 'Chicken Breast' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Black Beans' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: 'Chicken Breast' }))
    expect(search).toHaveValue('Chicken Breast')
  })

  it('keeps the first typed character when replacing an existing ingredient', () => {
    render(
      <MealForm
        meal={{
          id: 'meal-1',
          name: 'Existing meal',
          type: 'Dinner',
          proteinCategoryOverrideId: null,
          ingredients: [{ ingredientId: 'chicken-breast', quantity: 1 }],
        }}
        ingredients={ingredients}
        proteinCategories={proteinCategories}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    const search = screen.getByRole('combobox', { name: 'Ingredient 1' })
    fireEvent.change(search, { target: { value: 'l' } })

    expect(search).toHaveValue('l')
    expect(screen.getByRole('option', { name: 'Lime' })).toBeInTheDocument()
  })

  it('supports keyboard selection from filtered ingredient results', () => {
    render(
      <MealForm
        meal={null}
        ingredients={ingredients}
        proteinCategories={proteinCategories}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    const search = screen.getByRole('combobox', { name: 'Ingredient 1' })
    fireEvent.change(search, { target: { value: 'lime' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(search).toHaveValue('Lime')
    expect(search).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses Escape to close the picker first and the meal dialog second', () => {
    const onCancel = vi.fn()
    render(
      <MealForm
        meal={null}
        ingredients={ingredients}
        proteinCategories={proteinCategories}
        onCancel={onCancel}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    const search = screen.getByRole('combobox', { name: 'Ingredient 1' })
    expect(search).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveAttribute('aria-expanded', 'false')
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.keyDown(search, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
