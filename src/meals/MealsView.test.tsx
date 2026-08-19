import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { MealsView } from './MealsView'

describe('MealsView', () => {
  it('groups meals, formats ingredients, and exposes library actions', async () => {
    const state = createAppState()
    const onNew = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onDuplicate = vi.fn()
    const user = userEvent.setup()

    render(
      <MealsView
        meals={[state.meals[0]]}
        ingredients={state.ingredients}
        proteinCategories={seedProteinCategories}
        onNew={onNew}
        onEdit={onEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lunch' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dinner' })).toBeInTheDocument()
    expect(screen.getByText('1.5 cup Flour')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ New meal' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate meal' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onNew).toHaveBeenCalled()
    expect(onDuplicate).toHaveBeenCalledWith(state.meals[0])
    expect(onEdit).toHaveBeenCalledWith(state.meals[0])
    expect(onDelete).toHaveBeenCalledWith(state.meals[0].id)
  })
})
