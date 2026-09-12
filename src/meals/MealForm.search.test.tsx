import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Ingredient } from '../types'
import { MealForm } from './MealForm'

const ingredients: Ingredient[] = [
  { id: 'black-beans', name: 'Black Beans', unit: 'can', proteinCategoryId: null },
  { id: 'chicken-breast', name: 'Chicken Breast', unit: 'lb', proteinCategoryId: null },
  { id: 'lime', name: 'Lime', unit: 'each', proteinCategoryId: null },
]

const proteinCategories = [
  { id: 'none', name: 'None', color: '#999999' },
]

const shoppingCategories = [
  { id: 'produce', name: 'Produce' },
  { id: 'aisle', name: 'Aisle' },
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

  it('offers to create an ingredient when typed text has no exact catalog match', () => {
    render(
      <MealForm
        meal={null}
        ingredients={ingredients}
        proteinCategories={proteinCategories}
        onCreateIngredient={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Ingredient 1' }), { target: { value: 'Shallot' } })

    expect(screen.getByRole('option', { name: 'Create “Shallot”…' })).toBeInTheDocument()
  })

  it('does not offer inline creation when no persistence callback is available', () => {
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Ingredient 1' }), { target: { value: 'Shallot' } })

    expect(screen.queryByRole('option', { name: 'Create “Shallot”…' })).not.toBeInTheDocument()
  })

  it('creates a missing ingredient with the shared editor and selects it in the meal row', () => {
    function Harness() {
      const [catalog, setCatalog] = useState(ingredients)
      return (
        <MealForm
          meal={null}
          ingredients={catalog}
          proteinCategories={proteinCategories}
          shoppingCategories={shoppingCategories}
          onCreateIngredient={(ingredient) => setCatalog((current) => [...current, ingredient])}
          onCancel={vi.fn()}
          onSave={vi.fn()}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    const picker = screen.getByRole('combobox', { name: 'Ingredient 1' })
    fireEvent.change(picker, { target: { value: 'Shallot' } })
    fireEvent.click(screen.getByRole('option', { name: 'Create “Shallot”…' }))

    const editor = screen.getByRole('dialog', { name: 'New ingredient' })
    expect(within(editor).getByLabelText('Name')).toHaveValue('Shallot')
    fireEvent.change(within(editor).getByLabelText('Shopping category'), { target: { value: 'produce' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save ingredient' }))

    expect(screen.getByRole('combobox', { name: 'Ingredient 1' })).toHaveValue('Shallot')
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
