import { afterEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.hoisted(() => vi.fn(() => ({ client: true })))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  createClient.mockClear()
})

describe('Supabase configuration', () => {
  it('creates a persistent browser client from configured Vite variables', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key')
    vi.stubEnv('VITE_SUPABASE_STATE_ID', 'family')

    const module = await import('./supabase')
    expect(module.supabaseConfigured).toBe(true)
    expect(module.sharedStateId).toBe('family')
    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'publishable-key',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    )
  })

  it('uses inert fallback values and warns when configuration is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('VITE_SUPABASE_STATE_ID', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const module = await import('./supabase')
    expect(module.supabaseConfigured).toBe(false)
    expect(module.sharedStateId).toBe('household')
    expect(createClient).toHaveBeenCalledWith(
      'https://example.invalid',
      'missing-key',
      expect.any(Object),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Supabase is not configured'))
  })
})
