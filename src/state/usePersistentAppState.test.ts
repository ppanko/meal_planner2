import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'

const mocks = vi.hoisted(() => ({
  loadState: vi.fn(),
  saveState: vi.fn(),
  subscribeToRemoteState: vi.fn(),
  remoteListener: null as ((state: unknown) => void) | null,
  unsubscribe: vi.fn(),
}))

vi.mock('../storage', () => ({
  loadState: mocks.loadState,
  saveState: mocks.saveState,
  subscribeToRemoteState: mocks.subscribeToRemoteState,
}))

import { usePersistentAppState } from './usePersistentAppState'

beforeEach(() => {
  mocks.loadState.mockReset()
  mocks.saveState.mockReset().mockResolvedValue(undefined)
  mocks.unsubscribe.mockReset()
  mocks.remoteListener = null
  mocks.subscribeToRemoteState.mockReset().mockImplementation((listener) => {
    mocks.remoteListener = listener
    return mocks.unsubscribe
  })
})

describe('usePersistentAppState', () => {
  it('loads initial state, accepts realtime state, and unsubscribes', async () => {
    const local = createAppState({ meals: [] })
    const remote = createAppState({ ingredients: [] })
    mocks.loadState.mockResolvedValue(local)

    const { result, unmount } = renderHook(() => usePersistentAppState())
    expect(result.current.storageReady).toBe(false)

    await waitFor(() => expect(result.current.state).toBe(local))
    expect(result.current.storageReady).toBe(true)

    act(() => mocks.remoteListener?.(remote))
    expect(result.current.state).toBe(remote)

    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalled()
  })

  it('updates UI state immediately and persists asynchronously', async () => {
    const initial = createAppState()
    const next = createAppState({ meals: [] })
    mocks.loadState.mockResolvedValue(initial)
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toBe(initial))

    act(() => result.current.update(next))
    expect(result.current.state).toBe(next)
    expect(mocks.saveState).toHaveBeenCalledWith(next)
  })

  it('snapshots destructive updates and restores them with undo', async () => {
    const initial = createAppState()
    const next = createAppState({ meals: [] })
    mocks.loadState.mockResolvedValue(initial)
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toBe(initial))

    act(() => result.current.updateWithUndo(next, 'Deleted meals'))
    expect(result.current.state).toBe(next)
    expect(result.current.undoAction).toMatchObject({ message: 'Deleted meals' })
    expect(result.current.undoAction?.state).not.toBe(initial)

    act(() => result.current.undoLastAction())
    expect(result.current.state).toEqual(initial)
    expect(result.current.undoAction).toBeNull()
    expect(mocks.saveState).toHaveBeenLastCalledWith(expect.objectContaining({
      meals: initial.meals,
    }))
  })

  it('expires undo actions after six seconds and replaces prior timers', async () => {
    const initial = createAppState()
    mocks.loadState.mockResolvedValue(initial)
    const { result } = renderHook(() => usePersistentAppState())
    await waitFor(() => expect(result.current.state).toBe(initial))
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
  })

  it('ignores undo operations before state is loaded', () => {
    mocks.loadState.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => usePersistentAppState())
    act(() => result.current.updateWithUndo(createAppState(), 'No state'))
    act(() => result.current.undoLastAction())
    expect(result.current.state).toBeNull()
    expect(mocks.saveState).not.toHaveBeenCalled()
  })
})
