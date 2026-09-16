import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createHouseholdInvite: vi.fn(),
}))

vi.mock('./api', () => ({
  createHouseholdInvite: mocks.createHouseholdInvite,
}))

import { InviteHouseholdModal } from './InviteHouseholdModal'

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Invite a household</button>
      {open && <InviteHouseholdModal onClose={() => setOpen(false)} />}
    </>
  )
}

beforeEach(() => {
  vi.stubEnv('BASE_URL', './')
  window.history.replaceState(null, '', '/meal_planner2/')
  mocks.createHouseholdInvite.mockReset()
})

describe('InviteHouseholdModal', () => {
  it('creates a one-time invite link under the configured app base path and copies it', async () => {
    mocks.createHouseholdInvite.mockResolvedValue({
      token: 'invite-token',
      expiresAt: '2026-09-22T12:00:00.000Z',
    })
    const user = userEvent.setup()
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<InviteHouseholdModal onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create invite' }))

    const link = screen.getByLabelText('Invitation link') as HTMLInputElement
    expect(link.value).toContain('#invite=invite-token')
    expect(new URL(link.value).pathname).toBe('/meal_planner2/')
    expect(screen.getByText(/can be used once/i)).toBeInTheDocument()
    expect(link).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(link.value))
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

  it('moves focus into the dialog, traps Tab, and restores focus after Escape', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    const launcher = screen.getByRole('button', { name: 'Invite a household' })
    await user.click(launcher)

    const createButton = screen.getByRole('button', { name: 'Create invite' })
    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(createButton).toHaveFocus()

    await user.tab()
    expect(closeButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(createButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(launcher).toHaveFocus()
  })

  it('keeps focus trapped while invite creation is pending', async () => {
    mocks.createHouseholdInvite.mockImplementation(() => new Promise(() => undefined))
    const user = userEvent.setup()
    render(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: 'Invite a household' }))
    const createButton = screen.getByRole('button', { name: 'Create invite' })
    const closeButton = screen.getByRole('button', { name: 'Close' })
    await user.click(createButton)

    expect(createButton).toBeDisabled()
    expect(closeButton).toHaveFocus()
    await user.tab()
    expect(closeButton).toHaveFocus()
  })
})
