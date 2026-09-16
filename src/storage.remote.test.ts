import { beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  rpc: vi.fn(),
  removeChannel: vi.fn(),
  subscribe: vi.fn(),
  channel: vi.fn(),
  channelHandler: null as ((payload: unknown) => void) | null,
}))

vi.mock('./supabase', () => {
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: mocks.eq.mockReturnThis(),
    maybeSingle: mocks.maybeSingle,
  }
  const channel = {
    on: vi.fn((_event, _config, handler) => {
      mocks.channelHandler = handler
      return channel
    }),
    subscribe: mocks.subscribe,
  }
  mocks.channel.mockReturnValue(channel)

  return {
    supabaseConfigured: true,
    supabase: {
      from: vi.fn(() => selectChain),
      rpc: mocks.rpc,
      channel: mocks.channel,
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
  mocks.eq.mockClear()
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
  mocks.channel.mockClear()
  mocks.channelHandler = null
  localStorage.clear()
  await resetState(STATE_ID)
})

describe('remote persistence', () => {
  it('reads only the requested household state and normalizes it', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { state: { meals: [] }, revision: 7 }, error: null })

    const result = await loadState(STATE_ID)
    expect(result.meals).toEqual([])
    expect(result.ingredients).toHaveLength(seedState.ingredients.length)
    expect(mocks.eq).toHaveBeenCalledWith('id', STATE_ID)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('seeds an empty remote row into the requested household only', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await loadState(STATE_ID)
    expect(result.meals).toHaveLength(seedState.meals.length)
    expect(mocks.rpc).toHaveBeenCalledWith('save_meal_planner_state', expect.objectContaining({
      requested_id: STATE_ID,
      requested_state: expect.objectContaining({ meals: expect.any(Array) }),
      expected_revision: 0,
      mutation_id: expect.any(String),
    }))
  })

  it('falls back to the requested household local cache when the remote read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error('offline') })

    expect((await loadState(STATE_ID)).meals).toHaveLength(seedState.meals.length)
    expect(warn).toHaveBeenCalledWith(
      'Remote meal-planner state unavailable; using local cache.',
      expect.any(Error),
    )
  })

  it('preserves a pending local change while adopting the latest remote revision', async () => {
    const base = normalizeState({})
    const working = { ...base, plannerNotes: { '2026-08-17': { Dinner: 'Offline note' } } }
    const remoteState = { ...base, shoppingPurchasesByWeek: { '2026-08-17': { milk: 1 } } }
    await cacheSyncState(STATE_ID, {
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

    await expect(loadSyncState(STATE_ID)).resolves.toMatchObject({
      workingState: { plannerNotes: working.plannerNotes },
      confirmedState: { shoppingPurchasesByWeek: remoteState.shoppingPurchasesByWeek },
      revision: 4,
      pendingChanges: [expect.objectContaining({ id: 'pending-a' })],
      remoteAvailable: true,
    })
  })

  it('requires one-time review when the requested household legacy cache differs from the server', async () => {
    const base = normalizeState({})
    const local = { ...base, plannerNotes: { '2026-08-17': { Dinner: 'Possibly offline' } } }
    const server = { ...base, shoppingPurchasesByWeek: { '2026-08-17': { milk: 1 } } }
    await cacheLocalState(STATE_ID, local)
    mocks.maybeSingle.mockResolvedValue({ data: { state: server, revision: 6 }, error: null })

    await expect(loadSyncState(STATE_ID)).resolves.toMatchObject({
      workingState: { plannerNotes: local.plannerNotes },
      confirmedState: { shoppingPurchasesByWeek: server.shoppingPurchasesByWeek },
      revision: 6,
      pendingChanges: [{
        nextState: expect.objectContaining({ plannerNotes: local.plannerNotes }),
        requiresReview: true,
      }],
    })
  })

  it('writes normalized state with the requested state id, revision, and mutation id', async () => {
    const result = await saveState(STATE_ID, { ...normalizeState({}), meals: [] }, 4, 'mutation-a')
    expect(result).toMatchObject({ status: 'saved', snapshot: { revision: 5, state: { meals: [] } } })
    expect(mocks.rpc).toHaveBeenLastCalledWith('save_meal_planner_state', expect.objectContaining({
      requested_id: STATE_ID,
      expected_revision: 4,
      mutation_id: 'mutation-a',
      requested_state: expect.objectContaining({ meals: [] }),
    }))

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    await expect(saveState(STATE_ID, normalizeState({}), 5, 'mutation-b')).rejects.toThrow('offline')
  })

  it('returns the latest requested-household snapshot when the server detects a conflict', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'conflict', state: { meals: [] }, revision: 9, updated_at: null, updated_by: null },
      error: null,
    })

    await expect(saveState(STATE_ID, normalizeState({}), 8, 'mutation-c')).resolves.toMatchObject({
      status: 'conflict',
      snapshot: { revision: 9, state: { meals: [] } },
    })
  })

  it('subscribes to realtime updates for only the requested household and unsubscribes', () => {
    const onState = vi.fn()
    const unsubscribe = subscribeToRemoteState(STATE_ID, onState)
    expect(mocks.channel).toHaveBeenCalledWith(`meal-planner-state-${STATE_ID}`)
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
