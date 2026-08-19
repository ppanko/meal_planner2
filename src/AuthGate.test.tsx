import { render, screen, waitFor } from '@testing-library/react'
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

beforeEach(() => {
  mocks.unsubscribe.mockReset()
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } })
  mocks.onAuthStateChange.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribe } },
  })
  mocks.signInAnonymously.mockReset().mockResolvedValue({ data: { session }, error: null })
  mocks.rpc.mockReset().mockImplementation((name) => {
    if (name === 'is_meal_planner_authorized') return Promise.resolve({ data: false, error: null })
    return Promise.resolve({ data: true, error: null })
  })
})

describe('AuthGate', () => {
  it('renders children for an enrolled session and unsubscribes on cleanup', async () => {
    mocks.getSession.mockResolvedValue({ data: { session } })
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    const { unmount } = render(<AuthGate><div>Private app</div></AuthGate>)
    expect(screen.getByText('Opening Meal Planner…')).toBeInTheDocument()
    expect(await screen.findByText('Private app')).toBeInTheDocument()

    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalled()
  })

  it('enrolls a new anonymous device with the entered household code', async () => {
    const user = userEvent.setup()
    render(<AuthGate><div>Private app</div></AuthGate>)

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
    expect(mocks.rpc).not.toHaveBeenCalledWith('enroll_meal_planner_device', expect.anything())
  })

  it('keeps the gate closed when enrollment checks fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.getSession.mockResolvedValue({ data: { session } })
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('network') })
    render(<AuthGate><div>Private app</div></AuthGate>)

    expect(await screen.findByLabelText('Household code')).toBeInTheDocument()
    expect(warn).toHaveBeenCalledWith('Could not check meal-planner enrollment.', expect.any(Error))
  })
})
