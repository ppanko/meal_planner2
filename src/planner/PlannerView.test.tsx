import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./PlannerSlots', () => ({
  DraggableMeal: ({ meal, onTap }: { meal: { name: string }; onTap: () => void }) => (
    <button type="button" onClick={onTap}>Library {meal.name}</button>
  ),
  PlannerSlot: ({ day, rowId, meals, onRemoveMeal, onNoteChange }: {
    day: string
    rowId: string
    meals: { id: string }[]
    onRemoveMeal: (id: string) => void
    onNoteChange: (note: string) => void
  }) => (
    <div data-testid={`slot-${day}-${rowId}`}>
      {meals[0] && <button onClick={() => onRemoveMeal(meals[0].id)}>Desktop remove {meals[0].id}</button>}
      <button onClick={() => onNoteChange('Updated')}>Desktop note {rowId}</button>
    </div>
  ),
  MobilePlannerSlot: ({ label, meals, onAdd, onRemoveMeal, onNoteChange }: {
    label: string
    meals: { id: string }[]
    onAdd: () => void
    onRemoveMeal: (id: string) => void
    onNoteChange: (note: string) => void
  }) => (
    <div>
      <button onClick={onAdd}>Mobile add {label}</button>
      {meals[0] && <button onClick={() => onRemoveMeal(meals[0].id)}>Mobile remove {label}</button>}
      <button onClick={() => onNoteChange('Mobile note')}>Mobile note {label}</button>
    </div>
  ),
}))

import { seedProteinCategories } from '../data'
import { createAppState, weekDates } from '../test/fixtures'
import { PlannerView } from './PlannerView'

function callbacks() {
  return {
    setWeekOffset: vi.fn(),
    addMeal: vi.fn(),
    addMealToSlot: vi.fn(),
    removeMeal: vi.fn(),
    updatePlannerNote: vi.fn(),
    addPlannerRow: vi.fn(),
    removePlannerRow: vi.fn(),
    onCopyWeek: vi.fn(),
  }
}

describe('PlannerView', () => {
  it('navigates weeks, filters meals, and delegates planner actions', async () => {
    const state = createAppState({
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
      plannerNotes: { '2026-08-17': { Dinner: 'Existing' } },
      plannerRowsByWeek: { '2026-08-17': [{ id: 'custom-snack', label: 'Snack' }] },
    })
    const actions = callbacks()
    const user = userEvent.setup()
    render(
      <PlannerView
        state={state}
        weekDates={weekDates}
        weekOffset={2}
        proteinCategories={seedProteinCategories}
        {...actions}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Aug 17 – Aug 23' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy week' }))
    const controls = screen.getAllByRole('button')
    await user.click(controls.find((button) => button.textContent === '‹')!)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    await user.click(controls.find((button) => button.textContent === '›')!)
    expect(actions.onCopyWeek).toHaveBeenCalled()
    expect(actions.setWeekOffset.mock.calls.map(([value]) => value)).toEqual([1, 0, 3])

    const search = screen.getByLabelText('Search meals')
    await user.type(search, 'tacos')
    expect(screen.getByRole('button', { name: 'Library Tacos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Library Pancakes' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear meal search' }))
    await user.click(screen.getByRole('button', { name: 'Library Pancakes' }))
    expect(actions.addMeal).toHaveBeenCalledWith(expect.objectContaining({ id: 'pancakes' }))

    await user.click(screen.getAllByRole('button', { name: /Chicken/ })[0])
    expect(screen.getByRole('button', { name: 'Library Chicken & Rice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Library Tacos' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Desktop remove tacos' }))
    await user.click(screen.getAllByRole('button', { name: 'Desktop note Dinner' })[0])
    expect(actions.removeMeal).toHaveBeenCalledWith('2026-08-17', 'Dinner', 'tacos')
    expect(actions.updatePlannerNote).toHaveBeenCalledWith('2026-08-17', 'Dinner', 'Updated')

    await user.click(screen.getAllByRole('button', { name: 'Remove Snack row' })[0])
    expect(actions.removePlannerRow).toHaveBeenCalledWith('custom-snack')
  })

  it('adds custom rows and selects a meal from the mobile picker', async () => {
    const state = createAppState()
    const actions = callbacks()
    const user = userEvent.setup()
    render(
      <PlannerView
        state={state}
        weekDates={weekDates}
        weekOffset={0}
        proteinCategories={seedProteinCategories}
        {...actions}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^Browse meals/ }))
    expect(screen.getByRole('button', { name: /^Hide meals/ })).toBeInTheDocument()

    await user.click(screen.getAllByText('Add custom row')[0].closest('button')!)
    const nameInputs = screen.getAllByLabelText('Optional new planner row name')
    await user.type(nameInputs[0], 'Guests')
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0])
    expect(actions.addPlannerRow).toHaveBeenCalledWith('Guests')

    await user.click(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })[0])
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Pancakes/ }))
    expect(actions.addMealToSlot).toHaveBeenCalledWith(
      '2026-08-17',
      'Breakfast',
      expect.objectContaining({ id: 'pancakes' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a useful empty result for unmatched searches', async () => {
    const user = userEvent.setup()
    render(
      <PlannerView
        state={createAppState()}
        weekDates={weekDates}
        weekOffset={0}
        proteinCategories={seedProteinCategories}
        {...callbacks()}
      />,
    )
    await user.type(screen.getByLabelText('Search meals'), 'no such meal')
    expect(screen.getByText('No meals match “no such meal”.')).toBeInTheDocument()
  })
})
