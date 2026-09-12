import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShoppingCategoryDialog } from './ShoppingCategoryDialog'

describe('ShoppingCategoryDialog', () => {
  it('alphabetizes category assignment options without changing store order', () => {
    const categories = [
      { id: 'produce', name: 'Produce' },
      { id: 'bakery', name: 'Bakery' },
      { id: 'dairy', name: 'Dairy' },
    ]
    const { container } = render(
      <ShoppingCategoryDialog
        categories={categories}
        items={[{ key: 'apple', name: 'Apple', ingredientId: 'apple', manualIds: [], categoryId: null }]}
        search=""
        onClose={vi.fn()}
        onSearchChange={vi.fn()}
        onSetItemCategory={vi.fn()}
        onAddCategory={vi.fn()}
        onMoveCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    )

    expect(Array.from(container.querySelectorAll('.shopping-category-order-row > span'), (item) => item.textContent)).toEqual([
      'Produce',
      'Bakery',
      'Dairy',
    ])

    const select = screen.getByLabelText('Shopping category for Apple') as HTMLSelectElement
    expect(Array.from(select.options, (option) => option.text)).toEqual([
      'Uncategorized',
      'Bakery',
      'Dairy',
      'Produce',
    ])
  })
})
