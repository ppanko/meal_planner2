import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncConflictDialog } from './SyncConflictDialog'

describe('SyncConflictDialog', () => {
  it('summarizes non-meal overlaps and delegates each safe fallback', async () => {
    const onResolve = vi.fn()
    const onDefer = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <SyncConflictDialog
        conflict={{
          paths: [
            'planner.2026-08-17.Dinner',
            'manualShoppingItems.2026-08-17[manual]',
            'shoppingPurchasesByWeek.2026-08-17.milk',
          ],
          canSaveMealCopy: false,
        }}
        onResolve={onResolve}
        onDefer={onDefer}
      />,
    )

    expect(screen.getByRole('alertdialog')).toHaveTextContent('The same planner slot')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('The same shopping item')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('The same purchase status')
    await user.click(screen.getByRole('button', { name: 'Use latest' }))
    await user.click(screen.getByRole('button', { name: 'Keep this device' }))
    await user.click(screen.getByRole('button', { name: 'Decide later' }))
    expect(onResolve.mock.calls).toEqual([['latest'], ['device']])
    expect(onDefer).toHaveBeenCalled()

    rerender(
      <SyncConflictDialog
        conflict={{ paths: ['state'], canSaveMealCopy: false }}
        onResolve={onResolve}
        onDefer={onDefer}
      />,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('The same saved information')
  })

  it('offers to preserve an overlapping meal edit as a copy', async () => {
    const onResolve = vi.fn()
    const user = userEvent.setup()
    render(
      <SyncConflictDialog
        conflict={{ paths: ['meals[tacos]'], canSaveMealCopy: true }}
        onResolve={onResolve}
        onDefer={vi.fn()}
      />,
    )

    expect(screen.getByText('Meal deleted or edited')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save mine as a copy' }))
    expect(onResolve).toHaveBeenCalledWith('copy')
  })
})
