import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInAnonymously: vi.fn(),
  rpc: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signInAnonymously: mocks.signInAnonymously,
    },
    rpc: mocks.rpc,
  },
}))

import AuthGate from './AuthGate'

const session = { user: { id: 'user-1' } }
let authStateCallback: ((event: string, nextSession: typeof session | null) => void) | null = null

function emitAuth(event: string, nextSession: typeof session | null) {
  if (!authStateCallback) throw new Error('Auth listener was not registered')
  act(() => authStateCallback?.(event, nextSession))
}

beforeEach(() => {
  authStateCallback = null
  mocks.unsubscribe.mockReset()
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null })
  mocks.onAuthStateChange.mockReset().mockImplementation((callback) => {
    authStateCallback = callback
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  })
  mocks.signInAnonymously.mockReset().mockResolvedValue({ data: { session }, error: null })
  mocks.rpc.mockReset().mockImplementation((name) => {
    if (name === 'is_meal_planner_authorized') return Promise.resolve({ data: false, error: null })
    return Promise.resolve({ data: true, error: null })
  })
})

describe('AuthGate', () => {
  it('bootstraps from the auth listener and renders children for an enrolled session', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    const { unmount } = render(<AuthGate><div>Private app</div></AuthGate>)
    expect(screen.getByText('Opening Meal Planner…')).toBeInTheDocument()

    emitAuth('INITIAL_SESSION', session)
    expect(await screen.findByText('Private app')).toBeInTheDocument()
    expect(mocks.getSession).not.toHaveBeenCalled()

    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalled()
  })

  it('defers enrollment verification until after the auth callback returns', async () => {
    let insideAuthCallback = false
    let rpcCalledInsideCallback: boolean | null = null
    mocks.rpc.mockImplementation(() => {
      rpcCalledInsideCallback = insideAuthCallback
      return Promise.resolve({ data: true, error: null })
    })

    render(<AuthGate><div>Private app</div></AuthGate>)
    if (!authStateCallback) throw new Error('Auth listener was not registered')

    insideAuthCallback = true
    act(() => authStateCallback?.('INITIAL_SESSION', session))
    insideAuthCallback = false

    expect(await screen.findByText('Private app')).toBeInTheDocument()
    expect(rpcCalledInsideCallback).toBe(false)
  })

  it('enrolls a new anonymous device with the entered household code', async () => {
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)
    emitAuth('INITIAL_SESSION', null)

    const input = await screen.findByLabelText('Household code')
    await user.type(input, '  secret-code  ')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))

    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalled())
    expect(mocks.rpc).toHaveBeenCalledWith('enroll_meal_planner_device', {
      access_code: 'secret-code',
    })
    expect(await screen.findByText('Private app')).toBeInTheDocument()
  })

  it('shows validation feedback for an invalid household code', async () => {
    mocks.rpc.mockImplementation((name) => Promise.resolve({
      data: name === 'is_meal_planner_authorized' ? false : false,
      error: null,
    }))
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)
    emitAuth('INITIAL_SESSION', null)

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
    emitAuth('INITIAL_SESSION', null)

    await user.type(await screen.findByLabelText('Household code'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Connect this device' }))
    expect(await screen.findByText('Anonymous sign-in disabled')).toBeInTheDocument()
    expect(mocks.rpc).not.toHaveBeenCalledWith('enroll_meal_planner_device', expect.anything())
  })

  it('shows a recoverable verification error after bounded enrollment retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('network') })

    render(<AuthGate><div>Private app</div></AuthGate>)
    emitAuth('INITIAL_SESSION', session)

    expect(await screen.findByText('Could not verify this device.')).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalled()
    expect(screen.queryByLabelText('Household code')).not.toBeInTheDocument()
    expect(screen.queryByText('Opening Meal Planner…')).not.toBeInTheDocument()
  })

  it('can retry verification without asking for the household code again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('network') })
    const user = userEvent.setup()

    render(<AuthGate><div>Private app</div></AuthGate>)
    emitAuth('INITIAL_SESSION', session)
    await screen.findByText('Could not verify this device.')

    mocks.rpc.mockResolvedValue({ data: true, error: null })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Private app')).toBeInTheDocument()
    expect(screen.queryByLabelText('Household code')).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
  })

  it('ignores an older enrollment result after a newer auth event wins', async () => {
    let resolveOlder!: (value: { data: boolean; error: null }) => void
    let resolveNewer!: (value: { data: boolean; error: null }) => void
    const older = new Promise<{ data: boolean; error: null }>((resolve) => { resolveOlder = resolve })
    const newer = new Promise<{ data: boolean; error: null }>((resolve) => { resolveNewer = resolve })

    mocks.rpc
      .mockReturnValueOnce(older)
      .mockReturnValueOnce(newer)

    render(<AuthGate><div>Private app</div></AuthGate>)
    emitAuth('INITIAL_SESSION', session)
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))

    emitAuth('TOKEN_REFRESHED', session)
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveNewer({ data: true, error: null })
      await newer
    })
    expect(await screen.findByText('Private app')).toBeInTheDocument()

    await act(async () => {
      resolveOlder({ data: false, error: null })
      await older
    })
    expect(screen.getByText('Private app')).toBeInTheDocument()
  })
})
