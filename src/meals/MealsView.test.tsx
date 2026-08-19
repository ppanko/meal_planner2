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
})
