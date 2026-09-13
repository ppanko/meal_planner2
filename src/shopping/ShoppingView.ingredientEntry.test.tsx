import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import { ShoppingView } from './ShoppingView'

function props() {
  const state = createAppState()
  return {
    shopping: [],
    manualItems: [],
    onToggle: vi.fn(),
    onAddIngredient: vi.fn(),
    onCreateIngredientAndAdd: vi.fn(),
    onAddManual: vi.fn(),
    onToggleManual: vi.fn(),
    onDeleteManual: vi.fn(),
    onClearChecked: vi.fn(),
    history: [],
    onAddHistory: vi.fn(),
    onDeleteHistory: vi.fn(),
    weekDates,
    weekOffset: 0,
    setWeekOffset: vi.fn(),
    ingredients: state.ingredients,
    proteinCategories: state.proteinCategories,
    shoppingCategories: [
      { id: 'produce', name: 'Produce' },
      { id: 'meat', name: 'Meat' },
      { id: 'dairy', name: 'Dairy' },
      { id: 'frozen', name: 'Frozen' },
      { id: 'aisle', name: 'Aisle' },
    ],
    onSetItemCategory: vi.fn(),
    onAddShoppingCategory: vi.fn(),
    onMoveShoppingCategory: vi.fn(),
    onDeleteShoppingCategory: vi.fn(),
  }
}

describe('ShoppingView unified ingredient entry', () => {
  it('selects an existing ingredient directly from the shared picker', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)

    const input = screen.getByRole('combobox', { name: 'Add shopping list item' })
    await user.type(input, 'milk')
    await user.click(screen.getByRole('option', { name: 'Milk' }))

    expect(callbacks.onAddIngredient).toHaveBeenCalledWith('milk')
    expect(callbacks.onAddManual).not.toHaveBeenCalled()
  })

  it('offers distinct one-off and reusable actions for unknown text', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)

    const input = screen.getByRole('combobox', { name: 'Add shopping list item' })
    await user.type(input, 'Paper towels')

    expect(screen.getByRole('option', { name: 'Add “Paper towels” to shopping list' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Create “Paper towels” as ingredient…' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'Add “Paper towels” to shopping list' }))
    expect(callbacks.onAddManual).toHaveBeenCalledWith('Paper towels')
    expect(callbacks.onCreateIngredientAndAdd).not.toHaveBeenCalled()
  })

  it('creates a reusable ingredient with the shared editor and adds it to shopping', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)

    const input = screen.getByRole('combobox', { name: 'Add shopping list item' })
    await user.type(input, 'Shallot')
    await user.click(screen.getByRole('option', { name: 'Create “Shallot” as ingredient…' }))

    const editor = screen.getByRole('dialog', { name: 'New ingredient' })
    expect(within(editor).getByLabelText('Name')).toHaveValue('Shallot')
    fireEvent.change(within(editor).getByLabelText('Shopping category'), { target: { value: 'produce' } })
    await user.click(within(editor).getByRole('button', { name: 'Save ingredient' }))

    expect(callbacks.onCreateIngredientAndAdd).toHaveBeenCalledWith(expect.objectContaining({
      id: 'shallot',
      name: 'Shallot',
      unit: 'each',
      shoppingCategoryId: 'produce',
    }))
    expect(screen.queryByRole('dialog', { name: 'New ingredient' })).not.toBeInTheDocument()
  })
})
