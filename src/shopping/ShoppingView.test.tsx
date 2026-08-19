import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createAppState, weekDates } from '../test/fixtures'
import type { ManualShoppingItem, ShoppingItem } from '../types'
import { ShoppingView } from './ShoppingView'

const shopping: ShoppingItem[] = [
  {
    lineId: 'outstanding:eggs', ingredientId: 'eggs', name: 'Eggs', unit: 'each',
    quantity: 2, checked: false, shoppingCategoryId: 'dairy',
  },
  {
    lineId: 'purchased:milk', ingredientId: 'milk', name: 'Milk', unit: 'cup',
    quantity: 1, checked: true, shoppingCategoryId: null,
  },
]

const manualItems: ManualShoppingItem[] = [
  { id: 'manual', name: 'Bagels', checked: false, shoppingCategoryId: 'custom-bakery' },
]

function props() {
  const state = createAppState()
  return {
    shopping,
    manualItems,
    onToggle: vi.fn(),
    onAddManual: vi.fn(),
    onToggleManual: vi.fn(),
    onDeleteManual: vi.fn(),
    onClearChecked: vi.fn(),
    history: [
      { id: 'history', name: 'Coffee', lastPurchasedAt: '2026-08-01T12:00:00.000Z', shoppingCategoryId: 'aisle' },
    ],
    onAddHistory: vi.fn(),
    onDeleteHistory: vi.fn(),
    weekDates,
    weekOffset: 1,
    setWeekOffset: vi.fn(),
    ingredients: state.ingredients,
    shoppingCategories: [
      { id: 'produce', name: 'Produce' },
      { id: 'dairy', name: 'Dairy' },
      { id: 'aisle', name: 'Aisle' },
      { id: 'custom-bakery', name: 'Bakery' },
    ],
    onSetItemCategory: vi.fn(),
    onAddShoppingCategory: vi.fn(),
    onMoveShoppingCategory: vi.fn(),
    onDeleteShoppingCategory: vi.fn(),
  }
}

describe('ShoppingView', () => {
  it('renders grouped shopping items and delegates item actions', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)

    expect(screen.getByRole('heading', { name: 'Aug 17 – Aug 23' })).toBeInTheDocument()
    expect(screen.getByText('2 items remaining')).toBeInTheDocument()
    expect(screen.getAllByText('Bakery').some((element) => element.closest('.shopping-category-label'))).toBe(true)
    expect(screen.queryByText('Additional')).not.toBeInTheDocument()
    expect(screen.getByText('Purchased')).toBeInTheDocument()
    expect(screen.queryByLabelText('Shopping category for Bagels')).not.toBeInTheDocument()

    const manualRow = screen.getByText('Bagels').closest('.shopping-item') as HTMLElement
    expect(manualRow.querySelector('.shopping-name')).toBeInTheDocument()
    expect(manualRow.querySelector('.shopping-item-actions')).toContainElement(
      screen.getByRole('button', { name: 'Delete Bagels' }),
    )

    expect(screen.getByText('Eggs').closest('.shopping-item'))
      .toHaveTextContent('2 each · meal plan')

    await user.click(screen.getByLabelText('Mark Eggs from meal plan purchased'))
    expect(callbacks.onToggle).toHaveBeenCalledWith('outstanding:eggs')

    await user.click(screen.getByLabelText('Mark manually added Bagels purchased'))
    await user.click(screen.getByRole('button', { name: 'Add Milk again' }))
    await user.click(screen.getByRole('button', { name: 'Delete Bagels' }))
    expect(callbacks.onToggleManual).toHaveBeenCalledWith('manual')
    expect(callbacks.onAddHistory).toHaveBeenCalledWith('Milk', null)
    expect(callbacks.onDeleteManual).toHaveBeenCalledWith('manual')

    await user.click(screen.getByRole('button', { name: 'Mark all needed' }))
    expect(callbacks.onClearChecked).toHaveBeenCalled()
  })

  it('adds manual items, navigates weeks, and reuses history', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)

    const addInput = screen.getByLabelText('Add shopping list item')
    expect(addInput).toHaveAttribute('role', 'combobox')
    await user.type(addInput, 'mi')
    expect(screen.getByRole('listbox', { name: 'Suggested shopping items' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Milk/ })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(addInput).toHaveValue('Milk')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(callbacks.onAddManual).toHaveBeenCalledWith('Milk')

    await user.type(addInput, 'egg')
    expect(screen.getByRole('option', { name: /Eggs/ })).toBeInTheDocument()
    await user.clear(addInput)
    await user.type(addInput, '  Apples  ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(callbacks.onAddManual).toHaveBeenCalledWith('Apples')
    expect(addInput).toHaveValue('')

    const navigation = screen.getAllByRole('button')
    await user.click(navigation.find((button) => button.textContent === '‹')!)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    await user.click(navigation.find((button) => button.textContent === '›')!)
    expect(callbacks.setWeekOffset.mock.calls.map(([value]) => value)).toEqual([0, 0, 2])

    const historyRow = screen.getByText('Coffee').closest('.history-row') as HTMLElement
    await user.click(within(historyRow).getByRole('button', { name: '+ Add again' }))
    await user.click(within(historyRow).getByRole('button', { name: 'Remove Coffee from past items' }))
    expect(callbacks.onAddHistory).toHaveBeenCalledWith('Coffee', 'aisle')
    expect(callbacks.onDeleteHistory).toHaveBeenCalledWith('history')

    await user.type(screen.getByLabelText('Search past shopping items'), 'missing')
    expect(screen.getByText('Checked-off shopping items will appear here for quick reuse.')).toBeInTheDocument()
  })

  it('shows when a past item is already needed instead of adding a duplicate', () => {
    const callbacks = props()
    render(<ShoppingView {...callbacks} history={[...callbacks.history, { id: 'bagels-history', name: 'Bagels', lastPurchasedAt: '2026-08-02', shoppingCategoryId: 'custom-bakery' }]} />)

    const historyRow = screen.getAllByText('Bagels').find((element) => element.closest('.history-row'))!.closest('.history-row') as HTMLElement
    expect(within(historyRow).getByRole('button', { name: 'On list' })).toBeDisabled()
  })

  it('keeps meal-derived and separately added copies on distinct rows', () => {
    const callbacks = props()
    render(<ShoppingView
      {...callbacks}
      shopping={[{
        lineId: 'outstanding:milk',
        ingredientId: 'milk',
        name: 'Milk',
        unit: 'cup',
        quantity: 3,
        totalQuantity: 3,
        checked: false,
        shoppingCategoryId: 'dairy',
      }]}
      manualItems={[{
        id: 'extra-milk',
        name: 'Milk',
        checked: false,
        ingredientId: 'milk',
        quantity: 1,
        unit: 'cup',
        shoppingCategoryId: 'dairy',
      }]}
    />)

    const milkRows = screen.getAllByText('Milk').map((name) => name.closest('.shopping-item') as HTMLElement)
    expect(milkRows).toHaveLength(2)
    expect(milkRows.find((row) => row.classList.contains('meal-shopping-item')))
      .toHaveTextContent('3 cup · meal plan')
    expect(milkRows.find((row) => row.classList.contains('manual-shopping-item')))
      .toHaveTextContent('Added separately')
  })

  it('supports pointer selection, reverse keyboard navigation, and dismissal', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)
    const addInput = screen.getByRole('combobox', { name: 'Add shopping list item' })

    await user.type(addInput, 'cof')
    const coffee = screen.getByRole('option', { name: /Coffee/ })
    fireEvent.pointerMove(coffee)
    fireEvent.pointerDown(coffee)
    expect(addInput).toHaveValue('Coffee')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.clear(addInput)
    await user.type(addInput, 'chi')
    await user.keyboard('{ArrowUp}{Enter}')
    expect(addInput).toHaveValue('Chicken')

    await user.clear(addInput)
    await user.type(addInput, 'bro')
    expect(screen.getByRole('option', { name: /Broccoli/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('organizes categories and persistent ingredient assignments', async () => {
    const callbacks = props()
    const user = userEvent.setup()
    render(<ShoppingView {...callbacks} />)

    await user.click(screen.getByRole('button', { name: 'Organize categories' }))
    const dialog = screen.getByRole('dialog', { name: 'Organize categories' })
    await user.click(within(dialog).getByRole('button', { name: 'Move Dairy up' }))
    await user.click(within(dialog).getByRole('button', { name: 'Move Bakery up' }))
    await user.click(within(dialog).getByRole('button', { name: 'Delete Bakery shopping category' }))
    expect(callbacks.onMoveShoppingCategory).toHaveBeenCalledWith('dairy', -1)
    expect(callbacks.onMoveShoppingCategory).toHaveBeenCalledWith('custom-bakery', -1)
    expect(callbacks.onDeleteShoppingCategory).toHaveBeenCalledWith('custom-bakery')

    await user.selectOptions(within(dialog).getByLabelText('Shopping category for Bagels'), 'dairy')
    expect(callbacks.onSetItemCategory).toHaveBeenCalledWith(null, ['manual'], 'dairy')

    await user.type(within(dialog).getByLabelText('New shopping category'), '  Bulk ')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))
    expect(callbacks.onAddShoppingCategory).toHaveBeenCalledWith('Bulk')

    const ingredientSearch = within(dialog).getByLabelText('Search items to categorize')
    await user.type(ingredientSearch, 'Eggs')
    const eggsSelect = within(dialog).getByLabelText('Shopping category for Eggs')
    await user.selectOptions(eggsSelect, 'dairy')
    expect(callbacks.onSetItemCategory).toHaveBeenCalledWith('eggs', [], 'dairy')

    await user.clear(ingredientSearch)
    await user.type(ingredientSearch, 'not an ingredient')
    expect(within(dialog).getByText('No items match your search.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders an empty-state explanation', () => {
    const callbacks = props()
    render(<ShoppingView {...callbacks} shopping={[]} manualItems={[]} history={[]} />)
    expect(screen.getByText('Shopping list is empty')).toBeInTheDocument()
    expect(screen.getByText('Checked-off shopping items will appear here for quick reuse.')).toBeInTheDocument()
  })
})
