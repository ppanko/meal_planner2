import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  removeChannel: vi.fn(),
  subscribe: vi.fn(),
  channelHandler: null as ((payload: unknown) => void) | null,
}))

vi.mock('./supabase', () => {
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mocks.maybeSingle,
  }
  const channel = {
    on: vi.fn((_event, _config, handler) => {
      mocks.channelHandler = handler
      return channel
    }),
    subscribe: mocks.subscribe,
  }

  return {
    sharedStateId: 'test-household',
    supabaseConfigured: true,
    supabase: {
      from: vi.fn(() => ({ ...selectChain, upsert: mocks.upsert })),
      channel: vi.fn(() => channel),
      removeChannel: mocks.removeChannel,
    },
  }
})

import { seedState } from './data'
import { loadState, normalizeState, resetState, saveState, subscribeToRemoteState } from './storage'

beforeEach(async () => {
  mocks.maybeSingle.mockReset()
  mocks.upsert.mockReset()
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.subscribe.mockReset()
  mocks.removeChannel.mockReset()
  mocks.channelHandler = null
  localStorage.clear()
  await resetState()
})

describe('remote persistence', () => {
  it('prefers remote state and normalizes it', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { state: { meals: [] } }, error: null })

    const result = await loadState()
    expect(result.meals).toEqual([])
    expect(result.ingredients).toHaveLength(seedState.ingredients.length)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('seeds an empty remote row from local state', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await loadState()
    expect(result.meals).toHaveLength(seedState.meals.length)
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-household',
        state: expect.objectContaining({ meals: expect.any(Array) }),
        updated_at: expect.any(String),
      }),
      { onConflict: 'id' },
    )
  })

  it('falls back to local state when the remote read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error('offline') })

    expect((await loadState()).meals).toHaveLength(seedState.meals.length)
    expect(warn).toHaveBeenCalledWith(
      'Remote meal-planner state unavailable; using local cache.',
      expect.any(Error),
    )
  })

  it('writes normalized state remotely and tolerates sync failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.upsert.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('offline') })

    await saveState({ ...normalizeState({}), meals: [] })
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: expect.objectContaining({ meals: [] }) }),
      { onConflict: 'id' },
    )

    await saveState(normalizeState({}))
    expect(warn).toHaveBeenCalledWith(
      'Could not sync meal-planner state to Supabase.',
      expect.any(Error),
    )
  })

  it('normalizes realtime updates, caches them, and unsubscribes', async () => {
    const onState = vi.fn()
    const unsubscribe = subscribeToRemoteState(onState)
    expect(mocks.subscribe).toHaveBeenCalled()

    mocks.channelHandler?.({ new: { state: { meals: [] } } })
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ meals: [] }))

    mocks.channelHandler?.({ new: {} })
    expect(onState).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(mocks.removeChannel).toHaveBeenCalled()
  })
})
