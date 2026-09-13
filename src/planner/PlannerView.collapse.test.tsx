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

  it('groups passed days behind one summary in the current week', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))

    renderPlanner()

    expect(screen.getByRole('button', { name: 'Show 3 past days' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Monday' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Tuesday' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Wednesday' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Thursday' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(4)
  })

  it('reveals past days one at a time from most recent to oldest', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))

    renderPlanner()

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 past days' }))
    expect(screen.getByRole('button', { name: 'Show previous day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Monday/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tuesday/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Wednesday/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show previous day' }))
    expect(screen.getByRole('button', { name: 'Collapse Wednesday' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tuesday/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Monday/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show previous day' }))
    expect(screen.getByRole('button', { name: 'Collapse Tuesday' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Monday/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Wednesday' }))
    expect(screen.queryByRole('button', { name: /Wednesday/ })).not.toBeInTheDocument()
  })

  it('reveals past-day headers and keeps an expanded past day visible when the group is hidden', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))

    renderPlanner()

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 past days' }))
    expect(screen.getByRole('button', { name: 'Expand Monday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand Tuesday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand Wednesday' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Monday' }))
    expect(screen.getByRole('button', { name: 'Collapse Monday' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Hide 3 past days' }))
    expect(screen.getByRole('button', { name: 'Collapse Monday' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Tuesday' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Wednesday' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Monday' }))
    expect(screen.queryByRole('button', { name: 'Expand Monday' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(4)
  })

  it('keeps non-current weeks expanded without a past-days summary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))
    const previousWeekDates = weekDates.map((date) => {
      const previous = new Date(date)
      previous.setDate(date.getDate() - 7)
      return previous
    })

    renderPlanner(previousWeekDates, -1)

    expect(screen.queryByRole('button', { name: /past days/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Collapse Monday' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('reapplies the grouped current-week defaults after navigating away and back', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 past days' }))
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

    expect(screen.getByRole('button', { name: 'Show 3 past days' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Monday' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mobile add Breakfast' })).toHaveLength(4)
  })
})
