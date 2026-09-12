import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProteinFilters } from './MealBrowser'

describe('ProteinFilters', () => {
  it('alphabetizes protein categories while keeping All first', () => {
    const categories = [
      { id: 'turkey', name: 'Turkey', color: '#999999' },
      { id: 'beef', name: 'Beef', color: '#777777' },
      { id: 'chicken', name: 'Chicken', color: '#555555' },
    ]

    render(<ProteinFilters categories={categories} value="All" onChange={vi.fn()} />)

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'All',
      'Beef',
      'Chicken',
      'Turkey',
    ])
    expect(categories.map(({ name }) => name)).toEqual(['Turkey', 'Beef', 'Chicken'])
  })
})
