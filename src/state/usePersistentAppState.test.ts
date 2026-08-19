import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import type { AppState } from '../types'
import type { LoadedSyncState, RemoteStateSnapshot } from '../sync/syncTypes'

const mocks = vi.hoisted(() => ({
  loadSyncState: vi.fn(),
  saveState: vi.fn(),
  cacheSyncState: vi.fn(),
  refreshRemoteState: vi.fn(),
  subscribeToRemoteState: vi.fn(),
  remoteListener: null as ((snapshot: RemoteStateSnapshot) => void) | null,
  unsubscribe: vi.fn(),
}))

vi.mock('../storage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../storage')>(),
  loadSyncState: mocks.loadSyncState,
  saveState: mocks.saveState,
  cacheSyncState: mocks.cacheSyncState,
  refreshRemoteState: mocks.refreshRemoteState,
  subscribeToRemoteState: mocks.subscribeToRemoteState,
}))

import { usePersistentAppState } from './usePersistentAppState'

function remote(state: AppState, revision: number): RemoteStateSnapshot {
  return { state, revision, updatedAt: '2026-08-19T12:00:00.000Z', updatedBy: 'device-b' }
}

function loaded(state: AppState, overrides: Partial<LoadedSyncState> = {}): LoadedSyncState {
  return {
    workingState: state,
    confirmedState: state,
    revision: 1,
    pendingChanges: [],
    remoteAvailable: true,
    ...overrides,
  }
}

function savedResult(state: AppState, revision: number) {
  return { status: 'saved' as const, snapshot: remote(state, revision) }
}

beforeEach(() => {
  mocks.loadSyncState.mockReset()
  mocks.saveState.mockReset().mockImplementation((state: AppState, revision: number) =>
    Promise.resolve(savedResult(state, revision + 1)))
  mocks.cacheSyncState.mockReset().mockResolvedValue(undefined)
  mocks.refreshRemoteState.mockReset().mockResolvedValue(null)
  mocks.unsubscribe.mockReset()
  mocks.remoteListener = null
  mocks.subscribeToRemoteState.mockReset().mockImplementation((listener) => {
    mocks.remoteListener = listener
    return mocks.unsubscribe
  })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000070')
})

afterEach(() => vi.useRealTimers())

describe('usePersistentAppState', () => {
  it('loads a sync session, accepts newer realtime state, and unsubscribes', async () => {
    const initial = createAppState({ meals: [] })
    const newer = createAppState({ ingredients: [] })
    mocks.loadSyncState.mockResolvedValue(loaded(initial, { revision: 4 }))

    const { result, unmount } = renderHook(() => usePersistentAppState())
    expect(result.current.storageReady).toBe(false)
    await waitFor(() => expect(result.current.state).toEqual(initial))
    expect(result.current.syncStatus).toBe('saved')

    act(() => mocks.remoteListener?.(remote(newer, 5)))
    expect(result.current.state).toEqual(newer)

    act(() => mocks.remoteListener?.(remote(initial, 4)))
    expect(result.current.state).toEqual(newer)
    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalled()
  })

  it('updates immediately and saves with the confirmed revision and mutation id', async () => {
    const initial = createAppState()
    const next = createAppState({ meals: [] })
    mocks.loadSyncState.mockResolvedValue(loaded(initial, { revision: 8 }))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => result.current.update(next))
    expect(result.current.state).toMatchObject({ meals: [] })
    expect(result.current.syncStatus).toBe('saving')
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(mocks.saveState).toHaveBeenCalledWith(
      expect.objectContaining({ meals: [] }),
      8,
      '00000000-0000-4000-8000-000000000070',
    )
    expect(mocks.cacheSyncState).toHaveBeenLastCalledWith(expect.objectContaining({
      revision: 9,
      pendingChanges: [],
    }))
  })

  it('serializes rapid changes and rebases the second change on the first save', async () => {
    const initial = createAppState()
    const first = { ...initial, shoppingPurchasesByWeek: { week: { milk: 1 } } }
    const second = {
      ...first,
      manualShoppingItems: { week: [{ id: 'more', name: 'Milk', checked: false }] },
    }
    let finishFirst: ((value: ReturnType<typeof savedResult>) => void) | undefined
    mocks.saveState
      .mockImplementationOnce((state: AppState, revision: number) => new Promise((resolve) => {
        finishFirst = resolve
        expect(revision).toBe(1)
        expect(state.shoppingPurchasesByWeek).toEqual(first.shoppingPurchasesByWeek)
      }))
      .mockImplementation((state: AppState, revision: number) => Promise.resolve(savedResult(state, revision + 1)))
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => {
      result.current.update(first)
      result.current.update(second)
    })
    await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(1))
    expect(result.current.state).toMatchObject({
      shoppingPurchasesByWeek: second.shoppingPurchasesByWeek,
      manualShoppingItems: { week: [expect.objectContaining({ id: 'more', name: 'Milk' })] },
    })

    act(() => finishFirst?.(savedResult(first, 2)))
    await waitFor(() => expect(mocks.saveState).toHaveBeenCalledTimes(2))
    expect(mocks.saveState.mock.calls[1][1]).toBe(2)
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(result.current.state).toMatchObject({
      shoppingPurchasesByWeek: second.shoppingPurchasesByWeek,
      manualShoppingItems: { week: [expect.objectContaining({ id: 'more', name: 'Milk' })] },
    })
  })

  it('automatically merges a non-overlapping server change after a revision conflict', async () => {
    const initial = createAppState()
    const local = { ...initial, shoppingPurchasesByWeek: { week: { milk: 1 } } }
    const server = { ...initial, plannerNotes: { '2026-08-17': { Dinner: 'Server note' } } }
    mocks.saveState
      .mockResolvedValueOnce({ status: 'conflict', snapshot: remote(server, 2) })
      .mockImplementation((state: AppState, revision: number) => Promise.resolve(savedResult(state, revision + 1)))
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => result.current.update(local))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))

    expect(mocks.saveState).toHaveBeenCalledTimes(2)
    expect(mocks.saveState.mock.calls[1][0]).toMatchObject({
      shoppingPurchasesByWeek: local.shoppingPurchasesByWeek,
      plannerNotes: server.plannerNotes,
    })
    expect(mocks.saveState.mock.calls[1][1]).toBe(2)
    expect(result.current.state).toMatchObject({
      shoppingPurchasesByWeek: local.shoppingPurchasesByWeek,
      plannerNotes: server.plannerNotes,
    })
  })

  it('keeps failed writes locally and retries them when connectivity returns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const initial = createAppState()
    const next = { ...initial, plannerNotes: { '2026-08-17': { Dinner: 'Offline note' } } }
    mocks.saveState
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation((state: AppState, revision: number) => Promise.resolve(savedResult(state, revision + 1)))
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => result.current.update(next))
    await waitFor(() => expect(result.current.syncStatus).toBe('offline'))
    expect(mocks.cacheSyncState).toHaveBeenLastCalledWith(expect.objectContaining({
      workingState: expect.objectContaining({ plannerNotes: next.plannerNotes }),
      pendingChanges: [expect.objectContaining({ nextState: expect.objectContaining({ plannerNotes: next.plannerNotes }) })],
    }))

    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(mocks.saveState).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
  })

  it('refreshes a read-only offline session after connectivity returns', async () => {
    const local = createAppState({ meals: [] })
    const server = createAppState({ plannerNotes: { '2026-08-17': { Dinner: 'Back online' } } })
    mocks.loadSyncState.mockResolvedValue(loaded(local, { remoteAvailable: false }))
    mocks.refreshRemoteState.mockResolvedValue(remote(server, 4))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.syncStatus).toBe('offline'))

    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(result.current.state).toEqual(server)
  })

  it('surfaces overlapping meal edits and can preserve the local meal as a copy', async () => {
    const initial = createAppState()
    const local = {
      ...initial,
      meals: initial.meals.map((meal) => meal.id === 'tacos' ? { ...meal, name: 'Local tacos' } : meal),
    }
    const server = {
      ...initial,
      meals: initial.meals.map((meal) => meal.id === 'tacos' ? { ...meal, name: 'Server tacos' } : meal),
    }
    mocks.saveState
      .mockResolvedValueOnce({ status: 'conflict', snapshot: remote(server, 2) })
      .mockImplementation((state: AppState, revision: number) => Promise.resolve(savedResult(state, revision + 1)))
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => result.current.update(local))
    await waitFor(() => expect(result.current.syncStatus).toBe('conflict'))
    expect(result.current.syncConflict).toEqual({
      paths: ['meals[tacos].name'],
      canSaveMealCopy: true,
    })

    act(() => result.current.resolveConflict('copy'))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(result.current.state?.meals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tacos', name: 'Server tacos' }),
      expect.objectContaining({ id: '00000000-0000-4000-8000-000000000070', name: 'Local tacos Copy' }),
    ]))
  })

  it('requires a generic choice for concurrent meal deletion and planner use', async () => {
    const initial = createAppState()
    const local = { ...initial, meals: initial.meals.filter(({ id }) => id !== 'tacos'), planner: {} }
    const server = { ...initial, planner: { '2026-08-17': { Dinner: ['tacos'] } } }
    mocks.saveState
      .mockResolvedValueOnce({ status: 'conflict', snapshot: remote(server, 2) })
      .mockImplementation((state: AppState, revision: number) => Promise.resolve(savedResult(state, revision + 1)))
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => result.current.update(local))
    await waitFor(() => expect(result.current.syncStatus).toBe('conflict'))
    expect(result.current.syncConflict).toMatchObject({ canSaveMealCopy: false })

    act(() => result.current.resolveConflict('device'))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(result.current.state?.meals).not.toContainEqual(expect.objectContaining({ id: 'tacos' }))
    expect(result.current.state?.planner['2026-08-17'].Dinner).toEqual([])
  })

  it('restores and syncs pending changes loaded from local persistence', async () => {
    const initial = createAppState()
    const pendingState = { ...initial, plannerNotes: { '2026-08-17': { Dinner: 'Recovered' } } }
    mocks.loadSyncState.mockResolvedValue(loaded(pendingState, {
      confirmedState: initial,
      revision: 3,
      pendingChanges: [{
        id: 'pending-a',
        baseState: initial,
        nextState: pendingState,
        createdAt: '2026-08-19T12:00:00.000Z',
      }],
    }))

    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.storageReady).toBe(true))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(mocks.saveState).toHaveBeenCalledWith(
      expect.objectContaining({ plannerNotes: pendingState.plannerNotes }),
      3,
      'pending-a',
    )
    expect(result.current.state).toMatchObject({ plannerNotes: pendingState.plannerNotes })
  })

  it('holds an ambiguous legacy cache for review instead of overwriting either version', async () => {
    const server = createAppState({ shoppingPurchasesByWeek: { week: { milk: 1 } } })
    const local = createAppState({ plannerNotes: { '2026-08-17': { Dinner: 'Possibly offline' } } })
    mocks.loadSyncState.mockResolvedValue(loaded(local, {
      confirmedState: server,
      revision: 6,
      pendingChanges: [{
        id: 'legacy-review',
        baseState: server,
        nextState: local,
        createdAt: '2026-08-19T12:00:00.000Z',
        requiresReview: true,
      }],
    }))

    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.syncStatus).toBe('conflict'))
    expect(result.current.syncConflict).toEqual({ paths: ['state'], canSaveMealCopy: false })
    expect(mocks.saveState).not.toHaveBeenCalled()

    act(() => result.current.resolveConflict('latest'))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    expect(result.current.state).toMatchObject({
      meals: server.meals,
      plannerNotes: server.plannerNotes,
      shoppingPurchasesByWeek: server.shoppingPurchasesByWeek,
    })
    expect(mocks.saveState).not.toHaveBeenCalled()
  })

  it('undoes only the original change and preserves newer remote fields', async () => {
    const initial = createAppState()
    const deleted = { ...initial, meals: initial.meals.filter(({ id }) => id !== 'tacos') }
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))

    act(() => result.current.updateWithUndo(deleted, 'Deleted Tacos'))
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
    const server = { ...deleted, plannerNotes: { '2026-08-17': { Dinner: 'Remote note' } } }
    act(() => mocks.remoteListener?.(remote(server, 3)))

    act(() => result.current.undoLastAction())
    expect(result.current.state?.meals).toContainEqual(expect.objectContaining({ id: 'tacos' }))
    expect(result.current.state?.plannerNotes).toEqual(server.plannerNotes)
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'))
  })

  it('expires undo actions after six seconds and ignores updates before loading', async () => {
    const initial = createAppState()
    mocks.loadSyncState.mockResolvedValue(loaded(initial))
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toEqual(initial))
    vi.useFakeTimers()

    act(() => result.current.updateWithUndo({ ...initial, meals: [] }, 'First'))
    act(() => {
      vi.advanceTimersByTime(3000)
      result.current.updateWithUndo({ ...initial, ingredients: [] }, 'Second')
      vi.advanceTimersByTime(5999)
    })
    expect(result.current.undoAction?.message).toBe('Second')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.undoAction).toBeNull()

    mocks.loadSyncState.mockReturnValueOnce(new Promise(() => undefined))
    const unavailable = renderHook(() => usePersistentAppState())
    act(() => unavailable.result.current.updateWithUndo(initial, 'No state'))
    act(() => unavailable.result.current.undoLastAction())
    expect(unavailable.result.current.state).toBeNull()
  })
})
