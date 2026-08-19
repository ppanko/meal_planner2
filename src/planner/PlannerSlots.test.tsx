import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@dnd-kit/core', () => ({
  useDraggable: vi.fn(() => ({
    attributes: { 'aria-roledescription': 'draggable' },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: { x: 4, y: 8, scaleX: 1, scaleY: 1 },
    isDragging: true,
  })),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
}))

import { seedProteinCategories } from '../data'
import { createAppState } from '../test/fixtures'
import { DraggableMeal, MealCard, MobilePlannerSlot, PlannerSlot } from './PlannerSlots'

const state = createAppState()
const meal = state.meals[0]

describe('planner slot components', () => {
  it('renders an interactive draggable meal and overlay card', async () => {
    const onTap = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DraggableMeal
        meal={meal}
        onTap={onTap}
        ingredients={state.ingredients}
        proteinCategories={seedProteinCategories}
      />,
    )
    const button = screen.getByRole('button', { name: /Pancakes/ })
    expect(button).toHaveClass('dragging')
    expect(button).toHaveStyle({ transform: 'translate3d(4px, 8px, 0)' })
    await user.click(button)
    expect(onTap).toHaveBeenCalled()

    rerender(
      <MealCard
        meal={meal}
        overlay
        ingredients={state.ingredients}
        proteinCategories={seedProteinCategories}
      />,
    )
    expect(screen.getByText('Pancakes').closest('.meal-card')).toHaveClass('overlay-card')
  })

  it('supports mobile add, remove, note save, and note cancellation', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onRemoveMeal = vi.fn()
    const onNoteChange = vi.fn()
    render(
      <MobilePlannerSlot
        label="Dinner"
        firstCustom
        meals={[meal]}
        note="Existing note"
        ingredients={state.ingredients}
        proteinCategories={seedProteinCategories}
        onAdd={onAdd}
        onRemoveMeal={onRemoveMeal}
        onNoteChange={onNoteChange}
      />,
    )

    const slot = screen.getByText('Dinner').closest('.mobile-planner-slot') as HTMLElement
    expect(slot).toHaveClass('first-custom-mobile-slot')
    await user.click(within(slot).getByRole('button', { name: '×' }))
    await user.click(within(slot).getByRole('button', { name: '+ Add another meal' }))
    expect(onRemoveMeal).toHaveBeenCalledWith(meal.id)
    expect(onAdd).toHaveBeenCalled()

    await user.click(within(slot).getByRole('button', { name: 'Edit note' }))
    const textarea = within(slot).getByPlaceholderText('Add a note…')
    await user.clear(textarea)
    await user.type(textarea, 'Updated note')
    await user.click(within(slot).getByRole('button', { name: 'Save' }))
    expect(onNoteChange).toHaveBeenCalledWith('Updated note')

    await user.click(within(slot).getByRole('button', { name: 'Edit note' }))
    await user.type(within(slot).getByPlaceholderText('Add a note…'), ' discarded')
    await user.click(within(slot).getByRole('button', { name: 'Cancel' }))
    expect(within(slot).queryByPlaceholderText('Add a note…')).not.toBeInTheDocument()
  })

  it('hides the mobile add action at three meals', () => {
    render(
      <MobilePlannerSlot
        label="Dinner"
        firstCustom={false}
        meals={[meal, { ...meal, id: '2' }, { ...meal, id: '3' }]}
        note=""
        ingredients={state.ingredients}
        proteinCategories={seedProteinCategories}
        onAdd={vi.fn()}
        onRemoveMeal={vi.fn()}
        onNoteChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Add meal/)).not.toBeInTheDocument()
  })

  it('renders empty desktop slots and edits notes in populated slots', async () => {
    const user = userEvent.setup()
    const onNoteChange = vi.fn()
    const onRemoveMeal = vi.fn()
    const props = {
      day: '2026-08-17',
      rowId: 'Dinner',
      note: '',
      onNoteChange,
      onRemoveMeal,
      ingredients: state.ingredients,
      proteinCategories: seedProteinCategories,
    }
    const { rerender } = render(<PlannerSlot {...props} meals={[]} />)
    expect(screen.getByText('Drop meal here')).toBeInTheDocument()

    rerender(<PlannerSlot {...props} meals={[meal]} note="Serve warm" />)
    await user.click(screen.getByRole('button', { name: `Remove ${meal.name} from slot` }))
    expect(onRemoveMeal).toHaveBeenCalledWith(meal.id)

    await user.click(screen.getByRole('button', { name: 'Edit note' }))
    const textarea = screen.getByPlaceholderText('Add a note…')
    await user.clear(textarea)
    await user.type(textarea, 'New desktop note')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onNoteChange).toHaveBeenCalledWith('New desktop note')
  })
})
