import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createHouseholdInvite: vi.fn(),
  clipboardWrite: vi.fn(),
}))

vi.mock('./api', () => ({
  createHouseholdInvite: mocks.createHouseholdInvite,
}))

import { InviteHouseholdModal } from './InviteHouseholdModal'

beforeEach(() => {
  mocks.createHouseholdInvite.mockReset()
  mocks.clipboardWrite.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.clipboardWrite },
  })
})

describe('InviteHouseholdModal', () => {
  it('creates a one-time invite link under the configured app base path and copies it', async () => {
    mocks.createHouseholdInvite.mockResolvedValue({
      token: 'invite-token',
      expiresAt: '2026-09-22T12:00:00.000Z',
    })
    const user = userEvent.setup()
    render(<InviteHouseholdModal onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create invite' }))

    const link = screen.getByLabelText('Invitation link') as HTMLInputElement
    expect(link.value).toContain('#invite=invite-token')
    expect(link.value).toContain(import.meta.env.BASE_URL)
    expect(screen.getByText(/can be used once/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(mocks.clipboardWrite).toHaveBeenCalledWith(link.value)
    expect(screen.getByRole('status')).toHaveTextContent('Invitation link copied.')
  })

  it('shows invite creation errors without exposing a link', async () => {
    mocks.createHouseholdInvite.mockRejectedValue(new Error('Not authorized'))
    const user = userEvent.setup()
    render(<InviteHouseholdModal onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create invite' }))

    expect(await screen.findByText('Not authorized')).toBeInTheDocument()
    expect(screen.queryByLabelText('Invitation link')).not.toBeInTheDocument()
  })

  it('closes from the modal close control', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<InviteHouseholdModal onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
