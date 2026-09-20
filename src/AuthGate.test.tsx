import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { useHouseholdSession } from './households/HouseholdContext'

function HouseholdChild({ onUnmount }: { onUnmount?: () => void }) {
  const { householdName } = useHouseholdSession()
  useEffect(() => () => onUnmount?.(), [onUnmount])
  return <div>Private app for {householdName}</div>
}

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
    render(<AuthGate><HouseholdChild /></AuthGate>)

    const input = await screen.findByLabelText('Household code')
    await user.type(input, '  secret-code  ')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))

    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())
    expect(mocks.enrollHousehold).toHaveBeenCalledWith('secret-code')
    expect(await screen.findByText('Private app for Second home')).toBeInTheDocument()
  })

  it('shows validation feedback for an invalid household code', async () => {
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

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
    render(<AuthGate><HouseholdChild /></AuthGate>)

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

    render(<AuthGate><HouseholdChild /></AuthGate>)
    await waitFor(() => expect(mocks.getMyHousehold).toHaveBeenCalledTimes(1))

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    await waitFor(() => expect(mocks.getMyHousehold).toHaveBeenCalledTimes(2))

    await act(async () => { resolveSecond?.(household2) })
    expect(await screen.findByText('Private app for Second home')).toBeInTheDocument()

    await act(async () => { resolveFirst?.(household1) })
    expect(screen.getByText('Private app for Second home')).toBeInTheDocument()
    expect(mocks.getMyHousehold).toHaveBeenCalledTimes(2)
  })

  it('ignores a late initial session result after a newer auth event', async () => {
    let resolveInitialSession: ((value: { data: { session: typeof session1 } }) => void) | undefined
    mocks.getSession.mockImplementation(() => new Promise((resolve) => {
      resolveInitialSession = resolve
    }))
    mocks.getMyHousehold
      .mockResolvedValueOnce(household2)
      .mockResolvedValueOnce(household1)

    render(<AuthGate><HouseholdChild /></AuthGate>)
    act(() => mocks.authListener?.('SIGNED_IN', session2))
    expect(await screen.findByText('Private app for Second home')).toBeInTheDocument()

    await act(async () => {
      resolveInitialSession?.({ data: { session: session1 } })
    })

    expect(screen.getByText('Private app for Second home')).toBeInTheDocument()
    expect(mocks.getMyHousehold).toHaveBeenCalledTimes(1)
  })

  it('keeps the authenticated app mounted while same-user token revalidation is delayed', async () => {
    let resolveRefresh: ((value: typeof household1) => void) | undefined
    const onUnmount = vi.fn()
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold
      .mockResolvedValueOnce(household1)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve }))

    render(<AuthGate><HouseholdChild onUnmount={onUnmount} /></AuthGate>)
    expect(await screen.findByText('Private app for Home')).toBeInTheDocument()

    act(() => mocks.authListener?.('TOKEN_REFRESHED', { ...session1 }))
    await waitFor(() => expect(mocks.getMyHousehold).toHaveBeenCalledTimes(2))

    expect(screen.getByText('Private app for Home')).toBeInTheDocument()
    expect(screen.queryByText('Opening Meal Planner…')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Household code')).not.toBeInTheDocument()
    expect(onUnmount).not.toHaveBeenCalled()

    await act(async () => { resolveRefresh?.(household1) })
    expect(screen.getByText('Private app for Home')).toBeInTheDocument()
    expect(onUnmount).not.toHaveBeenCalled()
  })

  it('keeps the authenticated app mounted when same-user token revalidation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const onUnmount = vi.fn()
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold
      .mockResolvedValueOnce(household1)
      .mockRejectedValueOnce(new Error('temporary network failure'))

    render(<AuthGate><HouseholdChild onUnmount={onUnmount} /></AuthGate>)
    expect(await screen.findByText('Private app for Home')).toBeInTheDocument()

    act(() => mocks.authListener?.('TOKEN_REFRESHED', { ...session1 }))
    await waitFor(() => expect(warn)
      .toHaveBeenCalledWith('Could not revalidate meal-planner enrollment.', expect.any(Error)))

    expect(screen.getByText('Private app for Home')).toBeInTheDocument()
    expect(screen.queryByText('Opening Meal Planner…')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Household code')).not.toBeInTheDocument()
    expect(onUnmount).not.toHaveBeenCalled()
  })

  it('clears the old household immediately while a changed user is resolving', async () => {
    let resolveNextHousehold: ((value: typeof household2) => void) | undefined
    const onUnmount = vi.fn()
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold
      .mockResolvedValueOnce(household1)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNextHousehold = resolve }))

    render(<AuthGate><HouseholdChild onUnmount={onUnmount} /></AuthGate>)
    expect(await screen.findByText('Private app for Home')).toBeInTheDocument()

    act(() => mocks.authListener?.('SIGNED_IN', session2))

    expect(await screen.findByText('Opening Meal Planner…')).toBeInTheDocument()
    expect(screen.queryByText('Private app for Home')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Household code')).not.toBeInTheDocument()
    expect(onUnmount).toHaveBeenCalledTimes(1)

    await act(async () => { resolveNextHousehold?.(household2) })
    expect(await screen.findByText('Private app for Second home')).toBeInTheDocument()
  })

  it('does not let a back-to-back same-user event retain the previous user household', async () => {
    let rejectNextHousehold: ((reason: Error) => void) | undefined
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold
      .mockResolvedValueOnce(household1)
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectNextHousehold = reject
      }))

    render(<AuthGate><HouseholdChild /></AuthGate>)
    expect(await screen.findByText('Private app for Home')).toBeInTheDocument()

    act(() => {
      mocks.authListener?.('SIGNED_IN', session2)
      mocks.authListener?.('TOKEN_REFRESHED', { ...session2 })
    })
    await waitFor(() => expect(mocks.getMyHousehold).toHaveBeenCalledTimes(2))

    expect(screen.queryByText('Private app for Home')).not.toBeInTheDocument()
    expect(screen.getByText('Opening Meal Planner…')).toBeInTheDocument()

    await act(async () => { rejectNextHousehold?.(new Error('temporary network failure')) })
    expect(await screen.findByLabelText('Household code')).toBeInTheDocument()
    expect(screen.queryByText('Private app for Home')).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith(
      'Could not check meal-planner enrollment.',
      expect.any(Error),
    )
  })

  it('clears stale enrollment fields and feedback when the authenticated user changes', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    const codeInput = await screen.findByLabelText('Household code')
    await user.type(codeInput, 'old-user-code')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    expect(await screen.findByText('That household access code is not valid.')).toBeInTheDocument()

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    const nextCodeInput = await screen.findByLabelText('Household code')

    expect(nextCodeInput).toHaveValue('')
    expect(screen.queryByText('That household access code is not valid.')).not.toBeInTheDocument()
  })

  it('clears a stale invite name and error when the authenticated user changes', async () => {
    window.location.hash = 'invite=invite-token'
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.redeemHouseholdInvite.mockRejectedValue(new Error('Old user invitation error'))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    const nameInput = await screen.findByLabelText('Household name')
    await user.type(nameInput, 'Old household')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByText('Old user invitation error')).toBeInTheDocument()

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    const nextNameInput = await screen.findByLabelText('Household name')

    expect(nextNameInput).toHaveValue('')
    expect(screen.queryByText('Old user invitation error')).not.toBeInTheDocument()
  })

  it('keeps an invite submission pending across its anonymous sign-in auth event', async () => {
    let resolveSignIn: ((value: { data: { session: typeof session1 }; error: null }) => void) | undefined
    window.location.hash = 'invite=invite-token'
    mocks.signInAnonymously.mockImplementation(() => new Promise((resolve) => {
      resolveSignIn = resolve
    }))
    mocks.redeemHouseholdInvite.mockResolvedValue({ ...household2, joinCode: 'join-code-123' })
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), 'New household')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())

    act(() => mocks.authListener?.('SIGNED_IN', session1))

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()

    await act(async () => {
      resolveSignIn?.({ data: { session: session1 }, error: null })
    })
    expect(await screen.findByLabelText('Household join code')).toHaveTextContent('join-code-123')
  })

  it('ignores a late anonymous sign-in error after another user becomes active', async () => {
    let resolveSignIn: ((value: {
      data: { session: null }
      error: { message: string }
    }) => void) | undefined
    mocks.signInAnonymously.mockImplementation(() => new Promise((resolve) => {
      resolveSignIn = resolve
    }))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household code'), 'old-user-code')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    expect(await screen.findByLabelText('Household code')).toHaveValue('')

    await act(async () => {
      resolveSignIn?.({ data: { session: null }, error: { message: 'Old sign-in error' } })
    })
    expect(screen.queryByText('Old sign-in error')).not.toBeInTheDocument()
  })

  it('does not enroll after a delayed sign-in crosses an A-to-B-to-A identity change', async () => {
    let resolveSignIn: ((value: { data: { session: typeof session1 }; error: null }) => void) | undefined
    mocks.signInAnonymously.mockImplementation(() => new Promise((resolve) => {
      resolveSignIn = resolve
    }))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household code'), 'obsolete-code')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())

    act(() => {
      mocks.authListener?.('SIGNED_IN', session1)
      mocks.authListener?.('SIGNED_IN', session2)
      mocks.authListener?.('SIGNED_IN', session1)
    })
    await act(async () => {
      resolveSignIn?.({ data: { session: session1 }, error: null })
    })

    expect(mocks.enrollHousehold).not.toHaveBeenCalled()
  })

  it('does not redeem after a delayed sign-in crosses an A-to-B-to-A identity change', async () => {
    let resolveSignIn: ((value: { data: { session: typeof session1 }; error: null }) => void) | undefined
    window.location.hash = 'invite=invite-token'
    mocks.signInAnonymously.mockImplementation(() => new Promise((resolve) => {
      resolveSignIn = resolve
    }))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), 'Obsolete household')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())

    act(() => {
      mocks.authListener?.('SIGNED_IN', session1)
      mocks.authListener?.('SIGNED_IN', session2)
      mocks.authListener?.('SIGNED_IN', session1)
    })
    await act(async () => {
      resolveSignIn?.({ data: { session: session1 }, error: null })
    })

    expect(mocks.redeemHouseholdInvite).not.toHaveBeenCalled()
  })

  it('ignores a late enrollment result from the previous authenticated user', async () => {
    let resolveEnrollment: ((value: null) => void) | undefined
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.enrollHousehold.mockImplementation(() => new Promise((resolve) => {
      resolveEnrollment = resolve
    }))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household code'), 'old-user-code')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    await waitFor(() => expect(mocks.enrollHousehold).toHaveBeenCalled())

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    expect(await screen.findByLabelText('Household code')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Connect this device' })).toBeEnabled()

    await act(async () => { resolveEnrollment?.(null) })
    expect(screen.queryByText('That household access code is not valid.')).not.toBeInTheDocument()
  })

  it('ignores a late invite error from the previous authenticated user', async () => {
    let rejectRedemption: ((reason: Error) => void) | undefined
    window.location.hash = 'invite=invite-token'
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.redeemHouseholdInvite.mockImplementation(() => new Promise((_, reject) => {
      rejectRedemption = reject
    }))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), 'Old household')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(mocks.redeemHouseholdInvite).toHaveBeenCalled())

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    expect(await screen.findByLabelText('Household name')).toHaveValue('')

    await act(async () => { rejectRedemption?.(new Error('Old user invitation error')) })
    expect(screen.queryByText('Old user invitation error')).not.toBeInTheDocument()
  })

  it('does not commit an obsolete invite redemption if the original user becomes active again', async () => {
    let resolveRedemption: ((value: typeof household2 & { joinCode: string }) => void) | undefined
    window.location.hash = 'invite=invite-token'
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.redeemHouseholdInvite.mockImplementation(() => new Promise((resolve) => {
      resolveRedemption = resolve
    }))
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), 'Old household')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(mocks.redeemHouseholdInvite).toHaveBeenCalled())

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    expect(await screen.findByLabelText('Household name')).toHaveValue('')
    act(() => mocks.authListener?.('SIGNED_IN', session1))
    expect(await screen.findByLabelText('Household name')).toHaveValue('')

    await act(async () => {
      resolveRedemption?.({ ...household2, joinCode: 'obsolete-join-code' })
    })
    expect(screen.queryByLabelText('Household join code')).not.toBeInTheDocument()
    expect(screen.queryByText('Private app for Second home')).not.toBeInTheDocument()
  })

  it('does not commit enrollment after the authenticated user changes', async () => {
    let resolveEnrollment: ((value: typeof household1) => void) | undefined
    mocks.enrollHousehold.mockImplementation(() => new Promise((resolve) => {
      resolveEnrollment = resolve
    }))
    mocks.getMyHousehold.mockResolvedValue(household2)
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household code'), 'secret-code')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    await waitFor(() => expect(mocks.enrollHousehold).toHaveBeenCalled())

    act(() => mocks.authListener?.('SIGNED_IN', session2))
    expect(await screen.findByText('Private app for Second home')).toBeInTheDocument()

    await act(async () => { resolveEnrollment?.(household1) })
    expect(screen.getByText('Private app for Second home')).toBeInTheDocument()
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

  it('does not expose a redeemed household join code after the authenticated user changes', async () => {
    window.location.hash = 'invite=invite-token'
    mocks.redeemHouseholdInvite.mockResolvedValue({ ...household2, joinCode: 'join-code-123' })
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    await user.type(await screen.findByLabelText('Household name'), 'Second home')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByLabelText('Household join code')).toHaveTextContent('join-code-123')

    mocks.getMyHousehold.mockResolvedValue(household1)
    act(() => mocks.authListener?.('SIGNED_IN', session2))

    expect(await screen.findByText('Private app for Home')).toBeInTheDocument()
    expect(screen.queryByLabelText('Household join code')).not.toBeInTheDocument()
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

  it('rejects control characters in household names before redemption', async () => {
    window.location.hash = 'invite=invite-token'
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    fireEvent.change(await screen.findByLabelText('Household name'), {
      target: { value: 'Unsafe\u0007name' },
    })
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    expect(await screen.findByText('Enter a household name without control characters.'))
      .toBeInTheDocument()
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
    expect(mocks.redeemHouseholdInvite).not.toHaveBeenCalled()
  })

  it('counts Unicode code points for the household name limit', async () => {
    window.location.hash = 'invite=invite-token'
    const validUnicodeName = '🏠'.repeat(50)
    mocks.redeemHouseholdInvite.mockResolvedValue({ ...household2, joinCode: 'join-code-123' })
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

    fireEvent.change(await screen.findByLabelText('Household name'), {
      target: { value: validUnicodeName },
    })
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    await waitFor(() => expect(mocks.redeemHouseholdInvite)
      .toHaveBeenCalledWith('invite-token', validUnicodeName))
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

  it('requires a fresh invitation acknowledgement after the authenticated user changes', async () => {
    window.location.hash = 'invite=other-token'
    mocks.getSession.mockResolvedValue({ data: { session: session1 } })
    mocks.getMyHousehold.mockResolvedValue(household1)
    const user = userEvent.setup()
    render(<AuthGate><HouseholdChild /></AuthGate>)

    expect(await screen.findByText('Already connected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to planner' }))
    expect(await screen.findByText('Private app for Home')).toBeInTheDocument()

    mocks.getMyHousehold.mockResolvedValue(household2)
    act(() => mocks.authListener?.('SIGNED_IN', session2))

    expect(await screen.findByText('Already connected')).toBeInTheDocument()
    expect(screen.queryByText('Private app for Second home')).not.toBeInTheDocument()
  })
})
