import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Ingredient, Meal } from '../types'
import { seedProteinCategories } from '../data'
import { MobileMealPicker } from './MobileMealPicker'

const ingredients: Ingredient[] = [
  { id: 'flour', name: 'Flour', unit: 'cup', proteinCategoryId: null },
  { id: 'egg', name: 'Egg', unit: 'each', proteinCategoryId: null },
  { id: 'cheese', name: 'Cheese', unit: 'oz', proteinCategoryId: null },
]

const meals: Meal[] = [
  {
    id: 'pancakes',
    name: 'Pancakes',
    type: 'Breakfast',
    proteinCategoryOverrideId: null,
    ingredients: [
      { ingredientId: 'flour', quantity: 2 },
      { ingredientId: 'egg', quantity: 1 },
    ],
  },
  {
    id: 'omelet',
    name: 'Omelet',
    type: 'Breakfast',
    proteinCategoryOverrideId: null,
    ingredients: [
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'cheese', quantity: 1 },
    ],
  },
]

function renderPicker(onChoose = vi.fn()) {
  render(
    <MobileMealPicker
      slot={{ day: '2026-09-13', rowId: 'Breakfast', label: 'Breakfast' }}
      meals={meals}
      ingredients={ingredients}
      proteinCategories={seedProteinCategories}
      search=""
      proteinFilter="All"
      onSearchChange={vi.fn()}
      onProteinFilterChange={vi.fn()}
      onChoose={onChoose}
      onClose={vi.fn()}
    />,
  )
  return onChoose
}

describe('MobileMealPicker', () => {
  it('reveals ingredients inline while keeping only one meal expanded', async () => {
    const user = userEvent.setup()
    renderPicker()

    expect(screen.queryByText('Flour')).not.toBeInTheDocument()
    expect(screen.queryByText('Cheese')).not.toBeInTheDocument()

    const pancakesDisclosure = screen.getByRole('button', { name: 'Show ingredients for Pancakes' })
    await user.click(pancakesDisclosure)
    expect(pancakesDisclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Flour')).toBeInTheDocument()
    expect(screen.getByText('Egg')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show ingredients for Omelet' }))
    expect(screen.queryByText('Flour')).not.toBeInTheDocument()
    expect(screen.getByText('Cheese')).toBeInTheDocument()
  })

  it('still adds a meal directly from the picker row', async () => {
    const user = userEvent.setup()
    const onChoose = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Add Pancakes' }))
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'pancakes' }))
  })

  it('keeps picker overrides order-independent and gives the disclosure a 44px touch target', () => {
    const styles = readFileSync(path.resolve(process.cwd(), 'src/planner/MobileMealPicker.css'), 'utf8')
    const addRule = styles.match(/\.mobile-picker-meal\.mobile-picker-meal-add\s*\{([^}]*)\}/s)?.[1] ?? ''
    const disclosureRule = styles.match(/\.mobile-picker-ingredients-toggle\s*\{([^}]*)\}/s)?.[1] ?? ''

    expect(addRule).toMatch(/border-bottom:\s*0/)
    expect(disclosureRule).toMatch(/flex:\s*0\s+0\s+44px/)
    expect(disclosureRule).toMatch(/min-width:\s*44px/)
    expect(disclosureRule).toMatch(/min-height:\s*44px/)
  })
})
