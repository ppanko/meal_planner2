import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShoppingHistory } from './ShoppingHistory'

describe('ShoppingHistory', () => {
  it('groups past items by shopping category and alphabetizes within each group', () => {
    render(
      <ShoppingHistory
        history={[
          { id: 'ziti', name: 'Ziti', lastPurchasedAt: '2026-09-12', shoppingCategoryId: 'aisle' },
          { id: 'coffee', name: 'Coffee', lastPurchasedAt: '2026-01-01', shoppingCategoryId: 'aisle' },
          { id: 'milk', name: 'Milk', lastPurchasedAt: '2026-09-11', shoppingCategoryId: 'dairy' },
          { id: 'apple', name: 'Apple', lastPurchasedAt: '2026-09-10', shoppingCategoryId: 'produce' },
          { id: 'paper', name: 'Paper towels', lastPurchasedAt: '2026-09-09', shoppingCategoryId: null },
        ]}
        categories={[
          { id: 'dairy', name: 'Dairy' },
          { id: 'produce', name: 'Produce' },
          { id: 'aisle', name: 'Aisle' },
        ]}
        totalCount={5}
        search=""
        onSearchChange={vi.fn()}
        neededNames={new Set()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent))
      .toEqual(['Dairy', 'Produce', 'Aisle', 'Uncategorized'])

    const aisleGroup = screen.getByRole('heading', { name: 'Aisle' }).closest('.history-group') as HTMLElement
    expect(within(aisleGroup).getAllByRole('strong').map((item) => item.textContent))
      .toEqual(['Coffee', 'Ziti'])
  })
})
