import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./PlannerSlots', () => ({
  DraggableMeal: ({ meal }: { meal: { name: string } }) => <div>Library {meal.name}</div>,
  PlannerSlot: ({ rowId }: { rowId: string }) => <div>Desktop {rowId}</div>,
  MobilePlannerSlot: ({
    label,
    hideLabel,
    onAdd,
  }: {
    label: string
    hideLabel?: boolean
    onAdd: () => void
  }) => (
    <div data-testid={`mobile-slot-${label}`} data-label-hidden={hideLabel ? 'true' : 'false'}>
      {!hideLabel && <span>{label}</span>}
      <button type="button" onClick={onAdd}>Add {label}</button>
    </div>
  ),
}))

vi.mock('./MobileMealPicker', () => ({
  MobileMealPicker: ({ slot }: { slot: { rowId: string } }) => (
    <div role="dialog">Picker {slot.rowId}</div>
  ),
}))

import { seedProteinCategories } from '../data'
import { createAppState, weekDates } from '../test/fixtures'
import { dateKey } from '../utils/dates'
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

function renderPlanner(state = createAppState(), dates = weekDates, weekOffset = 0) {
  return render(
    <PlannerView
      state={state}
      weekDates={dates}
      weekOffset={weekOffset}
      proteinCategories={seedProteinCategories}
      {...callbacks()}
    />,
  )
}

describe('mobile meal tabs', () => {
  it('shows Breakfast by default and switches the standard row with accessible tabs', () => {
    renderPlanner()

    const breakfast = screen.getByRole('tab', { name: 'Breakfast' })
    const lunch = screen.getByRole('tab', { name: 'Lunch' })
    const dinner = screen.getByRole('tab', { name: 'Dinner' })

    expect(breakfast).toHaveAttribute('aria-selected', 'true')
    expect(lunch).toHaveAttribute('aria-selected', 'false')
    expect(dinner).toHaveAttribute('aria-selected', 'false')
    expect(screen.getAllByRole('button', { name: 'Add Breakfast' })).toHaveLength(7)
    expect(screen.queryByRole('button', { name: 'Add Lunch' })).not.toBeInTheDocument()

    fireEvent.click(lunch)

    expect(breakfast).toHaveAttribute('aria-selected', 'false')
    expect(lunch).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('button', { name: 'Add Lunch' })).toHaveLength(7)
    expect(screen.queryByRole('button', { name: 'Add Breakfast' })).not.toBeInTheDocument()
  })

  it('keeps custom rows visible while tabs switch standard rows', () => {
    const weekKey = dateKey(weekDates[0])
    const state = createAppState({
      plannerRowsByWeek: {
        [weekKey]: [{ id: 'custom-snack', label: 'Snack' }],
      },
    })

    renderPlanner(state)

    expect(screen.getAllByRole('button', { name: 'Add Snack' })).toHaveLength(7)

    fireEvent.click(screen.getByRole('tab', { name: 'Dinner' }))

    expect(screen.getAllByRole('button', { name: 'Add Dinner' })).toHaveLength(7)
    expect(screen.getAllByRole('button', { name: 'Add Snack' })).toHaveLength(7)
    expect(screen.queryByRole('button', { name: 'Add Breakfast' })).not.toBeInTheDocument()
  })

  it('hides the redundant standard-row label but keeps custom-row labels', () => {
    const weekKey = dateKey(weekDates[0])
    const state = createAppState({
      plannerRowsByWeek: {
        [weekKey]: [{ id: 'custom-snack', label: 'Snack' }],
      },
    })

    renderPlanner(state)

    for (const slot of screen.getAllByTestId('mobile-slot-Breakfast')) {
      expect(slot).toHaveAttribute('data-label-hidden', 'true')
    }
    for (const slot of screen.getAllByTestId('mobile-slot-Snack')) {
      expect(slot).toHaveAttribute('data-label-hidden', 'false')
    }
  })

  it('preserves the selected tab when the visible week changes', () => {
    const actions = callbacks()
    const state = createAppState()
    const { rerender } = render(
      <PlannerView
        state={state}
        weekDates={weekDates}
        weekOffset={0}
        proteinCategories={seedProteinCategories}
        {...actions}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Lunch' }))

    const nextWeekDates = weekDates.map((date) => {
      const next = new Date(date)
      next.setDate(date.getDate() + 7)
      return next
    })

    rerender(
      <PlannerView
        state={state}
        weekDates={nextWeekDates}
        weekOffset={1}
        proteinCategories={seedProteinCategories}
        {...actions}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Lunch' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('button', { name: 'Add Lunch' })).toHaveLength(7)
  })

  it('opens the mobile picker for the selected standard row', () => {
    renderPlanner()

    fireEvent.click(screen.getByRole('tab', { name: 'Lunch' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Lunch' })[0])

    expect(screen.getByRole('dialog')).toHaveTextContent('Picker Lunch')
  })
})
