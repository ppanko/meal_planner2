import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealsView } from './MealsView'

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

    await user.clear(search)
    await user.type(search, 'chicken')
    expect(screen.getByText('Weeknight Tacos')).toBeInTheDocument()
    expect(screen.queryByText('Apple Salad')).not.toBeInTheDocument()
  })
})
