import { supabaseConfigured } from './supabase'
import { appStatesEqual } from './sync/mergeAppState'
import type { LoadedSyncState, LocalSyncSnapshot, RemoteWriteResult } from './sync/syncTypes'
import type { AppState } from './types'
import {
  cacheLocalSyncSnapshot,
  cacheState,
  hasStoredLocalState,
  loadLocalState,
  loadLocalSyncSnapshot,
  resetLocalState,
} from './persistence/localState'
import { normalizeState } from './persistence/normalizeState'
import { readRemoteState, subscribeToRemoteState, writeRemoteState } from './persistence/remoteState'

export { normalizeState, subscribeToRemoteState }

export const refreshRemoteState = readRemoteState

function localSession(state: AppState, snapshot: LocalSyncSnapshot | null): LoadedSyncState {
  return {
    workingState: snapshot?.workingState ?? state,
    confirmedState: snapshot?.confirmedState ?? state,
    revision: snapshot?.revision ?? 0,
    pendingChanges: snapshot?.pendingChanges ?? [],
    remoteAvailable: false,
  }
}

export async function loadSyncState(): Promise<LoadedSyncState> {
  const [local, localSync, hadStoredLocalState] = await Promise.all([
    loadLocalState(),
    loadLocalSyncSnapshot(),
    hasStoredLocalState(),
  ])

  if (!supabaseConfigured) {
    const state = localSync?.workingState ?? local
    const loaded: LoadedSyncState = {
      workingState: state,
      confirmedState: state,
      revision: localSync?.revision ?? 0,
      pendingChanges: [],
      remoteAvailable: true,
    }
    await cacheLocalSyncSnapshot(loaded)
    return loaded
  }

  try {
    const remote = await readRemoteState()
    if (remote) {
      const hasLegacyDifference = !localSync
        && hadStoredLocalState
        && !appStatesEqual(local, remote.state)
      const legacyPendingChange = hasLegacyDifference
        ? [{
            id: crypto.randomUUID(),
            baseState: remote.state,
            nextState: local,
            createdAt: new Date().toISOString(),
            requiresReview: true,
          }]
        : []
      const loaded: LoadedSyncState = localSync?.pendingChanges.length || legacyPendingChange.length > 0
        ? {
            workingState: localSync?.workingState ?? local,
            confirmedState: remote.state,
            revision: remote.revision,
            pendingChanges: localSync?.pendingChanges ?? legacyPendingChange,
            remoteAvailable: true,
          }
        : {
            workingState: remote.state,
            confirmedState: remote.state,
            revision: remote.revision,
            pendingChanges: [],
            remoteAvailable: true,
          }
      await cacheLocalSyncSnapshot(loaded)
      return loaded
    }

    const initialState = localSync?.workingState ?? local
    const result = await writeRemoteState(initialState, 0, crypto.randomUUID())
    const loaded: LoadedSyncState = {
      workingState: result.snapshot.state,
      confirmedState: result.snapshot.state,
      revision: result.snapshot.revision,
      pendingChanges: [],
      remoteAvailable: true,
    }
    await cacheLocalSyncSnapshot(loaded)
    return loaded
  } catch (error) {
    console.warn('Remote meal-planner state unavailable; using local cache.', error)
    return localSession(local, localSync)
  }
}

export async function loadState(): Promise<AppState> {
  return (await loadSyncState()).workingState
}

export async function saveState(
  state: AppState,
  expectedRevision = 0,
  mutationId: string = crypto.randomUUID(),
): Promise<RemoteWriteResult> {
  const normalized = normalizeState(state)
  await cacheState(normalized)
  const result = await writeRemoteState(normalized, expectedRevision, mutationId)
  if (!supabaseConfigured && result.status === 'saved') {
    await cacheLocalSyncSnapshot({
      workingState: result.snapshot.state,
      confirmedState: result.snapshot.state,
      revision: result.snapshot.revision,
      pendingChanges: [],
    })
  }
  return result
}

export const cacheSyncState = cacheLocalSyncSnapshot

export const resetState = resetLocalState
