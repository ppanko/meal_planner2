import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  supabaseConfigured: false,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    rpc: vi.fn(),
  },
}))

import AuthGate from './AuthGate'

describe('AuthGate without configuration', () => {
  it('explains how to configure Supabase', () => {
    render(<AuthGate><div>Private app</div></AuthGate>)
    expect(screen.getByText('SETUP REQUIRED')).toBeInTheDocument()
    expect(screen.getByText('.secrets.example')).toBeInTheDocument()
    expect(screen.queryByText('Private app')).not.toBeInTheDocument()
  })
})
