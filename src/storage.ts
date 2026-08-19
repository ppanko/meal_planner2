import { supabaseConfigured } from './supabase'
import type { AppState } from './types'
import { cacheState, loadLocalState, resetLocalState } from './persistence/localState'
import { normalizeState } from './persistence/normalizeState'
import { readRemoteState, subscribeToRemoteState, writeRemoteState } from './persistence/remoteState'

export { normalizeState, subscribeToRemoteState }

export async function loadState(): Promise<AppState> {
  const local = await loadLocalState()
  if (!supabaseConfigured) {
    await cacheState(local)
    return local
  }

  try {
    const remote = await readRemoteState()
    if (remote) {
      await cacheState(remote)
      return remote
    }
    await writeRemoteState(local)
    await cacheState(local)
    return local
  } catch (error) {
    console.warn('Remote meal-planner state unavailable; using local cache.', error)
    return local
  }
}

export async function saveState(state: AppState): Promise<void> {
  const normalized = normalizeState(state)
  await cacheState(normalized)
  if (!supabaseConfigured) return

  try {
    await writeRemoteState(normalized)
  } catch (error) {
    console.warn('Could not sync meal-planner state to Supabase.', error)
  }
}

export const resetState = resetLocalState
