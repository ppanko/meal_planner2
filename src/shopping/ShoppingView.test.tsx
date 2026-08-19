import { render, screen, within } from '@testing-library/react'
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

    await user.click(screen.getByLabelText('Mark Eggs purchased'))
    expect(callbacks.onToggle).toHaveBeenCalledWith('outstanding:eggs')

    await user.click(screen.getByLabelText('Mark Bagels purchased'))
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
    const { container } = render(<ShoppingView {...callbacks} />)

    const addInput = screen.getByLabelText('Add shopping list item')
    expect(addInput).toHaveAttribute('list', 'shopping-item-suggestions')
    expect(container.querySelector('datalist option[value="Milk"]')).toBeInTheDocument()
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
