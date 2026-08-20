import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
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
      from: vi.fn(() => selectChain),
      rpc: mocks.rpc,
      channel: vi.fn(() => channel),
      removeChannel: mocks.removeChannel,
    },
  }
})

import { seedState } from './data'
import { cacheState as cacheLocalState } from './persistence/localState'
import {
  cacheSyncState,
  loadState,
  loadSyncState,
  normalizeState,
  resetState,
  saveState,
  subscribeToRemoteState,
} from './storage'

beforeEach(async () => {
  mocks.maybeSingle.mockReset()
  mocks.rpc.mockReset()
  mocks.rpc.mockImplementation((_name, args) => Promise.resolve({
    data: {
      status: 'saved',
      state: args.requested_state,
      revision: args.expected_revision + 1,
      updated_at: '2026-08-19T12:00:00.000Z',
      updated_by: 'device-a',
    },
    error: null,
  }))
  mocks.subscribe.mockReset()
  mocks.removeChannel.mockReset()
  mocks.channelHandler = null
  localStorage.clear()
  await resetState()
})

describe('remote persistence', () => {
  it('prefers remote state and normalizes it', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { state: { meals: [] }, revision: 7 }, error: null })

    const result = await loadState()
    expect(result.meals).toEqual([])
    expect(result.ingredients).toHaveLength(seedState.ingredients.length)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('seeds an empty remote row from local state', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await loadState()
    expect(result.meals).toHaveLength(seedState.meals.length)
    expect(mocks.rpc).toHaveBeenCalledWith('save_meal_planner_state', expect.objectContaining({
      requested_id: 'test-household',
      requested_state: expect.objectContaining({ meals: expect.any(Array) }),
      expected_revision: 0,
      mutation_id: expect.any(String),
    }))
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

  it('preserves a pending local change while adopting the latest remote revision', async () => {
    const base = normalizeState({})
    const working = { ...base, plannerNotes: { '2026-08-17': { Dinner: 'Offline note' } } }
    const remoteState = { ...base, shoppingPurchasesByWeek: { '2026-08-17': { milk: 1 } } }
    await cacheSyncState({
      workingState: working,
      confirmedState: base,
      revision: 3,
      pendingChanges: [{
        id: 'pending-a',
        baseState: base,
        nextState: working,
        createdAt: '2026-08-19T12:00:00.000Z',
      }],
    })
    mocks.maybeSingle.mockResolvedValue({ data: { state: remoteState, revision: 4 }, error: null })

    await expect(loadSyncState()).resolves.toMatchObject({
      workingState: { plannerNotes: working.plannerNotes },
      confirmedState: { shoppingPurchasesByWeek: remoteState.shoppingPurchasesByWeek },
      revision: 4,
      pendingChanges: [expect.objectContaining({ id: 'pending-a' })],
      remoteAvailable: true,
    })
  })

  it('requires one-time review when a legacy local cache differs from the server', async () => {
    const base = normalizeState({})
    const local = { ...base, plannerNotes: { '2026-08-17': { Dinner: 'Possibly offline' } } }
    const server = { ...base, shoppingPurchasesByWeek: { '2026-08-17': { milk: 1 } } }
    await cacheLocalState(local)
    mocks.maybeSingle.mockResolvedValue({ data: { state: server, revision: 6 }, error: null })

    await expect(loadSyncState()).resolves.toMatchObject({
      workingState: { plannerNotes: local.plannerNotes },
      confirmedState: { shoppingPurchasesByWeek: server.shoppingPurchasesByWeek },
      revision: 6,
      pendingChanges: [{
        nextState: expect.objectContaining({ plannerNotes: local.plannerNotes }),
        requiresReview: true,
      }],
    })
  })

  it('writes normalized state with a revision and exposes sync failures', async () => {
    const result = await saveState({ ...normalizeState({}), meals: [] }, 4, 'mutation-a')
    expect(result).toMatchObject({ status: 'saved', snapshot: { revision: 5, state: { meals: [] } } })
    expect(mocks.rpc).toHaveBeenLastCalledWith('save_meal_planner_state', expect.objectContaining({
      expected_revision: 4,
      mutation_id: 'mutation-a',
      requested_state: expect.objectContaining({ meals: [] }),
    }))

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    await expect(saveState(normalizeState({}), 5, 'mutation-b')).rejects.toThrow('offline')
  })

  it('returns the latest snapshot when the server detects a conflict', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'conflict', state: { meals: [] }, revision: 9, updated_at: null, updated_by: null },
      error: null,
    })

    await expect(saveState(normalizeState({}), 8, 'mutation-c')).resolves.toMatchObject({
      status: 'conflict',
      snapshot: { revision: 9, state: { meals: [] } },
    })
  })

  it('normalizes realtime updates, caches them, and unsubscribes', async () => {
    const onState = vi.fn()
    const unsubscribe = subscribeToRemoteState(onState)
    expect(mocks.subscribe).toHaveBeenCalled()

    mocks.channelHandler?.({ new: { state: { meals: [] } } })
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ meals: [] }),
      revision: 0,
    }))

    mocks.channelHandler?.({ new: {} })
    expect(onState).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(mocks.removeChannel).toHaveBeenCalled()
  })
})
