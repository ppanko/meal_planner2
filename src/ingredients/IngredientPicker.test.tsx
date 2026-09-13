import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IngredientPicker } from './IngredientPicker'

const ingredients = [
  { id: 'chicken', name: 'Chicken', unit: 'lb', proteinCategoryId: 'chicken', shoppingCategoryId: null },
  { id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null, shoppingCategoryId: 'dairy' },
]

describe('IngredientPicker shared actions', () => {
  it('renders shopping and create actions for a missing ingredient', () => {
    render(
      <IngredientPicker
        label="Ingredient"
        ingredients={ingredients}
        value=""
        onChange={vi.fn()}
        onCreate={vi.fn()}
        createLabel={(name) => `Create “${name}” as ingredient…`}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: vi.fn(),
        }}
      />,
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Paper towels' } })

    expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
      'Add “Paper towels” to shopping list',
      'Create “Paper towels” as ingredient…',
    ])
  })

  it('suppresses create and one-off actions for an exact ingredient match', () => {
    render(
      <IngredientPicker
        label="Ingredient"
        ingredients={ingredients}
        value=""
        onChange={vi.fn()}
        onCreate={vi.fn()}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: vi.fn(),
        }}
      />,
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'milk' } })

    expect(screen.getByRole('option', { name: 'Milk' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /shopping list/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Create/i })).not.toBeInTheDocument()
  })

  it('navigates through both action rows with the keyboard', () => {
    const onSecondary = vi.fn()
    const onCreate = vi.fn()
    render(
      <IngredientPicker
        label="Ingredient"
        ingredients={ingredients}
        value=""
        onChange={vi.fn()}
        onCreate={onCreate}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: onSecondary,
        }}
      />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Shallot' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreate).toHaveBeenCalledWith('Shallot')
    expect(onSecondary).not.toHaveBeenCalled()
  })

  it('invokes the secondary action and clears the typed query', () => {
    const onSecondary = vi.fn()
    render(
      <IngredientPicker
        label="Ingredient"
        ingredients={ingredients}
        value=""
        onChange={vi.fn()}
        onCreate={vi.fn()}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: onSecondary,
        }}
      />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Paper towels' } })
    fireEvent.click(screen.getByRole('option', { name: 'Add “Paper towels” to shopping list' }))

    expect(onSecondary).toHaveBeenCalledWith('Paper towels')
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape without invoking either action', () => {
    const onSecondary = vi.fn()
    const onCreate = vi.fn()
    render(
      <IngredientPicker
        label="Ingredient"
        ingredients={ingredients}
        value=""
        onChange={vi.fn()}
        onCreate={onCreate}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: onSecondary,
        }}
      />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Very long ingredient name that should stay readable' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onSecondary).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })
})
