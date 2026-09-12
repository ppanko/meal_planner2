import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealsView } from './MealsView'

afterEach(() => vi.unstubAllGlobals())

function props(onNewIngredient: () => void) {
  const state = createAppState()
  return {
    meals: state.meals,
    ingredients: state.ingredients,
    proteinCategories: seedProteinCategories,
    onNew: vi.fn(),
    onNewIngredient,
    onManageLibrary: vi.fn(),
    onStartCooking: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
  }
}

describe('MealsView ingredient action', () => {
  it('opens ingredient creation from the desktop header', async () => {
    const onNewIngredient = vi.fn()
    const user = userEvent.setup()
    render(<MealsView {...props(onNewIngredient)} />)

    await user.click(screen.getByRole('button', { name: '+ Ingredient' }))
    expect(onNewIngredient).toHaveBeenCalledOnce()
  })

  it('keeps the ingredient action compact on mobile', async () => {
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
    const onNewIngredient = vi.fn()
    const user = userEvent.setup()
    render(<MealsView {...props(onNewIngredient)} />)

    expect(screen.getByText('+ Ing.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Ingredient' }))
    expect(onNewIngredient).toHaveBeenCalledOnce()
  })
})
