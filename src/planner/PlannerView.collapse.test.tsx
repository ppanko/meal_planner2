import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./PlannerSlots', () => ({
  DraggableMeal: ({ meal }: { meal: { name: string } }) => <div>Library {meal.name}</div>,
  PlannerSlot: ({ rowId }: { rowId: string }) => <div>Desktop {rowId}</div>,
  MobilePlannerSlot: ({ label }: { label: string }) => (
    <button type="button">Mobile add {label}</button>
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

function renderPlanner(dates = weekDates, weekOffset = 0) {
  return render(
    <PlannerView
      state={createAppState()}
      weekDates={dates}
      weekOffset={weekOffset}
      proteinCategories={seedProteinCategories}
      {...callbacks()}
    />,
  )
}

describe('mobile planner day collapse', () => {
  afterEach(() => vi.useRealTimers())

  it('collapses passed days by default in the current week', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))

    renderPlanner()

    expect(screen.getByRole('button', { name: 'Expand Monday' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Expand Tuesday' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Expand Wednesday' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Collapse Thursday' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(4)
  })

  it('lets users expand and collapse a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))

    renderPlanner()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Monday' }))
    expect(screen.getByRole('button', { name: 'Collapse Monday' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Monday' }))
    expect(screen.getByRole('button', { name: 'Expand Monday' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(4)
  })

  it('keeps non-current weeks expanded', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))
    const previousWeekDates = weekDates.map((date) => {
      const previous = new Date(date)
      previous.setDate(date.getDate() - 7)
      return previous
    })

    renderPlanner(previousWeekDates, -1)

    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Collapse Monday' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('reapplies current-week defaults after navigating away and back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))
    const previousWeekDates = weekDates.map((date) => {
      const previous = new Date(date)
      previous.setDate(date.getDate() - 7)
      return previous
    })
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

    fireEvent.click(screen.getByRole('button', { name: 'Expand Monday' }))
    expect(screen.getByRole('button', { name: 'Collapse Monday' })).toBeInTheDocument()

    rerender(
      <PlannerView
        state={state}
        weekDates={previousWeekDates}
        weekOffset={-1}
        proteinCategories={seedProteinCategories}
        {...actions}
      />,
    )
    rerender(
      <PlannerView
        state={state}
        weekDates={weekDates}
        weekOffset={0}
        proteinCategories={seedProteinCategories}
        {...actions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Expand Monday' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(4)
  })
})
