import type { AppState } from '../types'
import type { LocalSyncSnapshot, PendingStateChange } from '../sync/syncTypes'
import { normalizeState } from './normalizeState'

const DB_NAME = 'meal-planner-db'
const DB_VERSION = 1
const STORE_NAME = 'app'

const LEGACY_STATE_KEY = 'state'
const LEGACY_SYNC_STATE_KEY = 'sync-state-v2'
const LEGACY_LOCAL_STORAGE_KEY = 'meal-planner-state-v1'
const LEGACY_LOCAL_SYNC_KEY = 'meal-planner-sync-state-v2'

const stateKey = (stateId: string) => `state:${stateId}`
const syncStateKey = (stateId: string) => `sync-state-v2:${stateId}`
const fallbackStateKey = (stateId: string) => `meal-planner-state-v1:${stateId}`
const fallbackSyncKey = (stateId: string) => `meal-planner-sync-state-v2:${stateId}`

let legacyMigration: Promise<void> | null = null

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readIndexedDB<T>(key: string): Promise<T | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function writeIndexedDB<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

async function deleteIndexedDB(keys: string[]): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    keys.forEach((key) => store.delete(key))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

function readLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

async function persistMigratedValue<T>(
  indexedKey: string,
  fallbackKey: string,
  value: T,
): Promise<void> {
  try {
    await writeIndexedDB(indexedKey, value)
    localStorage.removeItem(fallbackKey)
  } catch {
    localStorage.setItem(fallbackKey, JSON.stringify(value))
  }
}

async function migrateLegacyHouseholdCache(): Promise<void> {
  if (legacyMigration) return legacyMigration

  legacyMigration = (async () => {
    let scopedState: AppState | null = null
    let scopedSync: LocalSyncSnapshot | null = null

    try {
      scopedState = await readIndexedDB<AppState>(stateKey('household'))
      scopedSync = await readIndexedDB<LocalSyncSnapshot>(syncStateKey('household'))
    } catch {
      // IndexedDB may be unavailable; localStorage fallbacks are checked below.
    }

    scopedState ??= readLocalStorage<AppState>(fallbackStateKey('household'))
    scopedSync ??= readLocalStorage<LocalSyncSnapshot>(fallbackSyncKey('household'))

    if (scopedState || scopedSync) {
      try {
        await deleteIndexedDB([LEGACY_STATE_KEY, LEGACY_SYNC_STATE_KEY])
      } catch {
        // New reads use only the existing scoped cache.
      }
      localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY)
      localStorage.removeItem(LEGACY_LOCAL_SYNC_KEY)
      return
    }

    let legacyState: AppState | null = null
    let legacySync: LocalSyncSnapshot | null = null

    try {
      legacyState = await readIndexedDB<AppState>(LEGACY_STATE_KEY)
      legacySync = await readIndexedDB<LocalSyncSnapshot>(LEGACY_SYNC_STATE_KEY)
    } catch {
      // Fall back to the pre-IndexedDB localStorage keys.
    }

    legacyState ??= readLocalStorage<AppState>(LEGACY_LOCAL_STORAGE_KEY)
    legacySync ??= readLocalStorage<LocalSyncSnapshot>(LEGACY_LOCAL_SYNC_KEY)

    if (!scopedSync && legacySync) {
      await persistMigratedValue(
        syncStateKey('household'),
        fallbackSyncKey('household'),
        legacySync,
      )
      if (!scopedState) {
        await persistMigratedValue(
          stateKey('household'),
          fallbackStateKey('household'),
          legacySync.workingState,
        )
        scopedState = legacySync.workingState
      }
      scopedSync = legacySync
    }

    if (!scopedState && legacyState) {
      await persistMigratedValue(
        stateKey('household'),
        fallbackStateKey('household'),
        legacyState,
      )
    }

    try {
      await deleteIndexedDB([LEGACY_STATE_KEY, LEGACY_SYNC_STATE_KEY])
    } catch {
      // Failure to clean old keys is harmless; new reads use only scoped keys.
    }
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY)
    localStorage.removeItem(LEGACY_LOCAL_SYNC_KEY)
  })()

  try {
    await legacyMigration
  } finally {
    legacyMigration = null
  }
}

async function ensureNamespaceReady(stateId: string): Promise<void> {
  if (stateId === 'household') await migrateLegacyHouseholdCache()
}

export async function loadLocalState(stateId: string): Promise<AppState> {
  await ensureNamespaceReady(stateId)
  try {
    const stored = await readIndexedDB<AppState>(stateKey(stateId))
    if (stored) return normalizeState(stored)
    const fallback = readLocalStorage<AppState>(fallbackStateKey(stateId))
    return fallback ? normalizeState(fallback) : normalizeState({})
  } catch {
    const fallback = readLocalStorage<AppState>(fallbackStateKey(stateId))
    return fallback ? normalizeState(fallback) : normalizeState({})
  }
}

export async function cacheState(stateId: string, state: AppState): Promise<void> {
  const normalized = normalizeState(state)
  try {
    await writeIndexedDB(stateKey(stateId), normalized)
    localStorage.removeItem(fallbackStateKey(stateId))
  } catch {
    localStorage.setItem(fallbackStateKey(stateId), JSON.stringify(normalized))
  }
}

function normalizePendingChange(change: PendingStateChange): PendingStateChange | null {
  if (!change || typeof change.id !== 'string' || !change.id) return null
  return {
    id: change.id,
    baseState: normalizeState(change.baseState ?? {}),
    nextState: normalizeState(change.nextState ?? {}),
    createdAt: typeof change.createdAt === 'string' ? change.createdAt : new Date(0).toISOString(),
    requiresReview: change.requiresReview === true || undefined,
  }
}

export async function hasStoredLocalState(stateId: string): Promise<boolean> {
  await ensureNamespaceReady(stateId)
  if (
    localStorage.getItem(fallbackStateKey(stateId)) !== null
    || localStorage.getItem(fallbackSyncKey(stateId)) !== null
  ) return true

  try {
    const [state, sync] = await Promise.all([
      readIndexedDB<AppState>(stateKey(stateId)),
      readIndexedDB<LocalSyncSnapshot>(syncStateKey(stateId)),
    ])
    return state !== null || sync !== null
  } catch {
    return false
  }
}

function normalizeSyncSnapshot(snapshot: LocalSyncSnapshot): LocalSyncSnapshot {
  return {
    workingState: normalizeState(snapshot.workingState ?? {}),
    confirmedState: normalizeState(snapshot.confirmedState ?? snapshot.workingState ?? {}),
    revision: typeof snapshot.revision === 'number' && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0
      ? snapshot.revision
      : 0,
    pendingChanges: Array.isArray(snapshot.pendingChanges)
      ? snapshot.pendingChanges.map(normalizePendingChange).filter((change): change is PendingStateChange => Boolean(change))
      : [],
  }
}

export async function loadLocalSyncSnapshot(stateId: string): Promise<LocalSyncSnapshot | null> {
  await ensureNamespaceReady(stateId)
  try {
    const stored = await readIndexedDB<LocalSyncSnapshot>(syncStateKey(stateId))
    if (stored) return normalizeSyncSnapshot(stored)
    const fallback = readLocalStorage<LocalSyncSnapshot>(fallbackSyncKey(stateId))
    return fallback ? normalizeSyncSnapshot(fallback) : null
  } catch {
    const fallback = readLocalStorage<LocalSyncSnapshot>(fallbackSyncKey(stateId))
    return fallback ? normalizeSyncSnapshot(fallback) : null
  }
}

export async function cacheLocalSyncSnapshot(
  stateId: string,
  snapshot: LocalSyncSnapshot,
): Promise<void> {
  const normalized = normalizeSyncSnapshot(snapshot)
  try {
    await Promise.all([
      writeIndexedDB(syncStateKey(stateId), normalized),
      writeIndexedDB(stateKey(stateId), normalized.workingState),
    ])
    localStorage.removeItem(fallbackSyncKey(stateId))
    localStorage.removeItem(fallbackStateKey(stateId))
  } catch {
    localStorage.setItem(fallbackSyncKey(stateId), JSON.stringify(normalized))
    localStorage.setItem(fallbackStateKey(stateId), JSON.stringify(normalized.workingState))
  }
}

export async function resetLocalState(stateId: string): Promise<void> {
  try {
    await deleteIndexedDB([stateKey(stateId), syncStateKey(stateId)])
    if (stateId === 'household') {
      try {
        await deleteIndexedDB([LEGACY_STATE_KEY, LEGACY_SYNC_STATE_KEY])
      } catch {
        // Best-effort cleanup of obsolete unscoped keys.
      }
    }
  } finally {
    localStorage.removeItem(fallbackStateKey(stateId))
    localStorage.removeItem(fallbackSyncKey(stateId))
    if (stateId === 'household') {
      localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY)
      localStorage.removeItem(LEGACY_LOCAL_SYNC_KEY)
    }
  }
}
