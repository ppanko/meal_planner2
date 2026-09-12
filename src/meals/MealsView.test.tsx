import { render, screen } from '@testing-library/react'
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

describe('MealsView', () => {
  it('groups meals, formats ingredients, and exposes library actions', async () => {
    const state = createAppState()
    const meal = { ...state.meals[0], recipeUrl: 'https://example.com', notes: 'A note', instructions: ['Cook'] }
    const onNew = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onDuplicate = vi.fn()
    const onManageLibrary = vi.fn()
    const onStartCooking = vi.fn()
    const user = userEvent.setup()

    render(
      <MealsView
        meals={[meal]}
        ingredients={state.ingredients}
        proteinCategories={seedProteinCategories}
        onNew={onNew}
        onManageLibrary={onManageLibrary}
        onStartCooking={onStartCooking}
        onEdit={onEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lunch' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument()
    expect(screen.getByText('1.5 cup Flour')).toBeInTheDocument()
    expect(screen.getByText('1 step')).toBeInTheDocument()
    expect(screen.getByText('Recipe link')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ New meal' }))
    await user.click(screen.getByRole('button', { name: 'Manage library' }))
    await user.click(screen.getByRole('button', { name: 'Start cooking' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onNew).toHaveBeenCalled()
    expect(onManageLibrary).toHaveBeenCalled()
    expect(onStartCooking).toHaveBeenCalledWith(expect.objectContaining({ id: state.meals[0].id }))
    expect(onDuplicate).toHaveBeenCalledWith(meal)
    expect(onEdit).toHaveBeenCalledWith(meal)
    expect(onDelete).toHaveBeenCalledWith(state.meals[0].id)
  })

  it('alphabetizes meals within each type and ingredients within each meal card', () => {
    const state = createAppState()
    const ingredients = [
      { id: 'zucchini', name: 'Zucchini', unit: 'each', proteinCategoryId: null },
      { id: 'apple', name: 'Apple', unit: 'each', proteinCategoryId: null },
    ]
    const baseMeal = state.meals[0]
    const zetaMeal = {
      ...baseMeal,
      id: 'zeta',
      name: 'Zeta Bowl',
      ingredients: [
        { ingredientId: 'zucchini', quantity: 1 },
        { ingredientId: 'apple', quantity: 2 },
      ],
    }
    const alphaMeal = { ...baseMeal, id: 'alpha', name: 'Alpha Bowl', ingredients: [] }

    const { container } = render(
      <MealsView
        meals={[zetaMeal, alphaMeal]}
        ingredients={ingredients}
        proteinCategories={seedProteinCategories}
        onNew={vi.fn()}
        onManageLibrary={vi.fn()}
        onStartCooking={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    )

    expect(Array.from(container.querySelectorAll('.meal-detail-card h3'), (heading) => heading.textContent)).toEqual([
      'Alpha Bowl',
      'Zeta Bowl',
    ])
    expect(Array.from(container.querySelectorAll('.meal-detail-card ul li'), (item) => item.textContent)).toEqual([
      '2 each Apple',
      '1 each Zucchini',
    ])
  })

  it('filters meals by meal name or ingredient name', async () => {
    const state = createAppState()
    const ingredients = [
      { id: 'chicken', name: 'Chicken thigh', unit: 'lb', proteinCategoryId: 'chicken' },
      { id: 'apple', name: 'Apple', unit: 'each', proteinCategoryId: null },
    ]
    const baseMeal = state.meals[0]
    const tacos = {
      ...baseMeal,
      id: 'tacos',
      name: 'Weeknight Tacos',
      ingredients: [{ ingredientId: 'chicken', quantity: 1 }],
    }
    const salad = {
      ...baseMeal,
      id: 'salad',
      name: 'Apple Salad',
      ingredients: [{ ingredientId: 'apple', quantity: 2 }],
    }
    const user = userEvent.setup()

    render(
      <MealsView
        meals={[tacos, salad]}
        ingredients={ingredients}
        proteinCategories={seedProteinCategories}
        onNew={vi.fn()}
        onManageLibrary={vi.fn()}
        onStartCooking={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    )

    const search = screen.getByRole('searchbox', { name: 'Search meals' })

    await user.type(search, 'tacos')
    expect(screen.getByText('Weeknight Tacos')).toBeInTheDocument()
    expect(screen.queryByText('Apple Salad')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lunch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dinner' })).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'chicken')
    expect(screen.getByText('Weeknight Tacos')).toBeInTheDocument()
    expect(screen.queryByText('Apple Salad')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'pork')
    expect(screen.getByText('No meals match “pork”.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Breakfast' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lunch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dinner' })).not.toBeInTheDocument()
  })

  it('uses Breakfast, Lunch, and Dinner tabs in the mobile Meals view', async () => {
    useMobileViewport()
    const state = createAppState()
    const baseMeal = state.meals[0]
    const breakfast = { ...baseMeal, id: 'breakfast', name: 'Apple Pancakes', type: 'Breakfast' as const }
    const lunch = { ...baseMeal, id: 'lunch', name: 'Chicken Salad', type: 'Lunch' as const }
    const dinner = { ...baseMeal, id: 'dinner', name: 'Beef Tacos', type: 'Dinner' as const }
    const user = userEvent.setup()

    render(
      <MealsView
        meals={[dinner, lunch, breakfast]}
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

    const breakfastTab = screen.getByRole('tab', { name: 'Breakfast' })
    const lunchTab = screen.getByRole('tab', { name: 'Lunch' })
    const dinnerTab = screen.getByRole('tab', { name: 'Dinner' })

    expect(breakfastTab).toHaveAttribute('aria-selected', 'true')
    expect(lunchTab).toHaveAttribute('aria-selected', 'false')
    expect(dinnerTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Apple Pancakes')).toBeInTheDocument()
    expect(screen.queryByText('Chicken Salad')).not.toBeInTheDocument()
    expect(screen.queryByText('Beef Tacos')).not.toBeInTheDocument()

    await user.click(lunchTab)

    expect(breakfastTab).toHaveAttribute('aria-selected', 'false')
    expect(lunchTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Apple Pancakes')).not.toBeInTheDocument()
    expect(screen.getByText('Chicken Salad')).toBeInTheDocument()
    expect(screen.queryByText('Beef Tacos')).not.toBeInTheDocument()
  })
})
