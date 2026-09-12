import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealsView } from './MealsView'

afterEach(() => vi.unstubAllGlobals())

function props() {
  const state = createAppState()
  return {
    meals: state.meals,
    ingredients: state.ingredients,
    proteinCategories: seedProteinCategories,
    onNew: vi.fn(),
    onManageLibrary: vi.fn(),
    onStartCooking: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
  }
}

describe('MealsView ingredient action', () => {
  it('keeps ingredient creation out of the desktop header', () => {
    render(<MealsView {...props()} />)

    expect(screen.getByRole('button', { name: 'Manage library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New meal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Ingredient' })).not.toBeInTheDocument()
  })

  it('keeps ingredient creation out of the mobile header', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 900px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))

    render(<MealsView {...props()} />)

    expect(screen.getByRole('button', { name: 'Manage library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New meal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Ingredient' })).not.toBeInTheDocument()
    expect(screen.queryByText('+ Ing.')).not.toBeInTheDocument()
  })
})
