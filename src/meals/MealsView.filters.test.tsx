import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealsView } from './MealsView'

afterEach(() => {
  vi.unstubAllGlobals()
})

function useMobileViewport() {
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
}

function renderMealsView() {
  const state = createAppState()
  const baseMeal = state.meals[0]
  const meals = [
    { ...baseMeal, id: 'breakfast', name: 'Apple Pancakes', type: 'Breakfast' as const },
    { ...baseMeal, id: 'lunch', name: 'Chicken Salad', type: 'Lunch' as const },
    { ...baseMeal, id: 'dinner', name: 'Beef Tacos', type: 'Dinner' as const },
  ]

  return render(
    <MealsView
      meals={meals}
      ingredients={state.ingredients}
      proteinCategories={seedProteinCategories}
      onNew={vi.fn()}
      onManageLibrary={vi.fn()}
      onStartCooking={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
    />,
  )
}

describe('MealsView filters', () => {
  it('treats mobile meal types as independent toggles where zero selected means all', async () => {
    useMobileViewport()
    const user = userEvent.setup()
    renderMealsView()

    const breakfast = screen.getByRole('button', { name: 'Breakfast' })
    const lunch = screen.getByRole('button', { name: 'Lunch' })
    const dinner = screen.getByRole('button', { name: 'Dinner' })

    expect(breakfast).toHaveAttribute('aria-pressed', 'false')
    expect(lunch).toHaveAttribute('aria-pressed', 'false')
    expect(dinner).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Apple Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText('Beef Tacos')).toBeInTheDocument()

    await user.click(breakfast)
    expect(breakfast).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Apple Pancakes')).toBeInTheDocument()
    expect(screen.queryByText('Chicken Salad')).not.toBeInTheDocument()
    expect(screen.queryByText('Beef Tacos')).not.toBeInTheDocument()

    await user.click(lunch)
    expect(lunch).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Apple Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.queryByText('Beef Tacos')).not.toBeInTheDocument()

    await user.click(dinner)
    expect(dinner).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Apple Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText('Beef Tacos')).toBeInTheDocument()

    await user.click(breakfast)
    await user.click(lunch)
    await user.click(dinner)
    expect(breakfast).toHaveAttribute('aria-pressed', 'false')
    expect(lunch).toHaveAttribute('aria-pressed', 'false')
    expect(dinner).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Apple Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText('Beef Tacos')).toBeInTheDocument()
  })

  it('sorts protein filters alphabetically with All first and None last', () => {
    const { container } = renderMealsView()
    const proteinFilter = container.querySelector('[aria-label="Filter meals by protein"]')
    expect(proteinFilter).not.toBeNull()

    expect(within(proteinFilter as HTMLElement).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'All',
      'Beef',
      'Chicken',
      'Lamb',
      'Pork',
      'Seafood',
      'None',
    ])
  })
})
