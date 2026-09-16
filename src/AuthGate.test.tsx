import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInAnonymously: vi.fn(),
  unsubscribe: vi.fn(),
  authListener: null as ((event: string, session: unknown) => void) | null,
  getMyHousehold: vi.fn(),
  enrollHousehold: vi.fn(),
  redeemHouseholdInvite: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signInAnonymously: mocks.signInAnonymously,
    },
  },
}))

vi.mock('./households/api', () => ({
  getMyHousehold: mocks.getMyHousehold,
  enrollHousehold: mocks.enrollHousehold,
  redeemHouseholdInvite: mocks.redeemHouseholdInvite,
}))

import AuthGate from './AuthGate'

const session1 = { user: { id: 'user-1' } }
const session2 = { user: { id: 'user-2' } }
const household1 = {
  householdId: '11111111-1111-4111-8111-111111111111',
  stateId: 'household',
  householdName: 'Home',
  isAdmin: true,
}
const household2 = {
  householdId: '22222222-2222-4222-8222-222222222222',
  stateId: '22222222-2222-4222-8222-222222222222',
  householdName: 'Second home',
  isAdmin: false,
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  mocks.unsubscribe.mockReset()
  mocks.authListener = null
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } })
  mocks.onAuthStateChange.mockReset().mockImplementation((listener) => {
    mocks.authListener = listener
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  })
  mocks.signInAnonymously.mockReset().mockResolvedValue({ data: { session: session1 }, error: null })
  mocks.getMyHousehold.mockReset().mockResolvedValue(null)
  mocks.enrollHousehold.mockReset().mockResolvedValue(null)
  mocks.redeemHouseholdInvite.mockReset()
})

describe('AuthGate', () => {
  it('renders children for an enrolled household session and unsubscribes on cleanup', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold.mockResolvedValue(household1)

    const { unmount } = render(<AuthGate><div>Private app</div></AuthGate>)
    expect(screen.getByText('Opening Meal Planner…')).toBeInTheDocument()
    expect(await screen.findByText('Private app')).toBeInTheDocument()

    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalled()
  })

  it('enrolls a new anonymous device into the household resolved by its join code', async () => {
    mocks.enrollHousehold.mockResolvedValue(household2)
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    const input = await screen.findByLabelText('Household code')
    await user.type(input, '  secret-code  ')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))

    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())
    expect(mocks.enrollHousehold).toHaveBeenCalledWith('secret-code')
    expect(await screen.findByText('Private app')).toBeInTheDocument()
  })

  it('shows validation feedback for an invalid household code', async () => {
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    await user.type(await screen.findByLabelText('Household code'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    expect(await screen.findByText('That household access code is not valid.')).toBeInTheDocument()
    expect(screen.queryByText('Private app')).not.toBeInTheDocument()
  })

  it('shows anonymous sign-in errors without attempting enrollment', async () => {
    mocks.signInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: 'Anonymous sign-in disabled' },
    })
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    await user.type(await screen.findByLabelText('Household code'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    expect(await screen.findByText('Anonymous sign-in disabled')).toBeInTheDocument()
    expect(mocks.enrollHousehold).not.toHaveBeenCalled()
  })

  it('keeps the gate closed when household lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold.mockRejectedValue(new Error('network'))
    render(<AuthGate><div>Private app</div></AuthGate>)

    expect(await screen.findByLabelText('Household code')).toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith('Could not check meal-planner enrollment.', expect.any(Error))
  })

  it('ignores an older household lookup that resolves after a newer auth session', async () => {
    let resolveFirst: ((value: typeof household1) => void) | undefined
    let resolveSecond: ((value: typeof household2) => void) | undefined
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

    render(<AuthGate><div>Private app</div></AuthGate>)
    await waitFor(() => expect(mocks.getMyHousehold).toHaveBeenCalledTimes(1))

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    await waitFor(() => expect(mocks.getMyHousehold).toHaveBeenCalledTimes(2))

    await act(async () => { resolveSecond?.(household2) })
    expect(await screen.findByText('Private app')).toBeInTheDocument()

    await act(async () => { resolveFirst?.(household1) })
    expect(screen.getByText('Private app')).toBeInTheDocument()
    expect(mocks.getMyHousehold).toHaveBeenCalledTimes(2)
  })

  it('redeems an invite for an unenrolled anonymous browser and shows the join code once', async () => {
    window.location.hash = 'invite=invite-token'
    mocks.redeemHouseholdInvite.mockResolvedValue({ ...household2, joinCode: 'join-code-123' })
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), '  The Smiths  ')
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    expect(mocks.signInAnonymously).toHaveBeenCalled()
    expect(mocks.redeemHouseholdInvite).toHaveBeenCalledWith('invite-token', 'The Smiths')
    expect(await screen.findByLabelText('Household join code')).toHaveTextContent('join-code-123')
    expect(window.location.hash).toBe('')

    await user.click(screen.getByRole('button', { name: 'Open planner' }))
    expect(await screen.findByText('Private app')).toBeInTheDocument()
  })

  it('keeps an invalid invite fragment for retry and shows the server error', async () => {
    window.location.hash = 'invite=bad-token'
    mocks.redeemHouseholdInvite.mockRejectedValue(new Error('Invitation is invalid, expired, or already used'))
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), 'New home')
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    expect(await screen.findByText('Invitation is invalid, expired, or already used')).toBeInTheDocument()
    expect(window.location.hash).toBe('#invite=bad-token')
  })

  it('does not redeem an invite on a browser already connected to a household', async () => {
    window.location.hash = 'invite=other-token'
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold.mockResolvedValue(household1)
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    expect(await screen.findByText('Already connected')).toBeInTheDocument()
    expect(mocks.redeemHouseholdInvite).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continue to planner' }))
    expect(await screen.findByText('Private app')).toBeInTheDocument()
    expect(window.location.hash).toBe('#invite=other-token')
  })
})
