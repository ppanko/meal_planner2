import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncStatusIndicator } from './SyncStatusIndicator'

describe('SyncStatusIndicator', () => {
  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['offline', 'Offline · saved here'],
  ] as const)('renders the %s status accessibly', (status, label) => {
    render(<SyncStatusIndicator status={status} onReview={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(label)
  })

  it('opens conflict review from the status control', async () => {
    const onReview = vi.fn()
    const user = userEvent.setup()
    render(<SyncStatusIndicator status="conflict" onReview={onReview} />)
    await user.click(screen.getByRole('button', { name: 'Review changes' }))
    expect(onReview).toHaveBeenCalled()
  })
})
