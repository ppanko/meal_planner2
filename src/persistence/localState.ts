import type { AppState } from '../types'
import type { LocalSyncSnapshot, PendingStateChange } from '../sync/syncTypes'
import { normalizeState } from './normalizeState'

const DB_NAME = 'meal-planner-db'
const DB_VERSION = 1
const STORE_NAME = 'app'
const STATE_KEY = 'state'
const SYNC_STATE_KEY = 'sync-state-v2'
const LEGACY_KEY = 'meal-planner-state-v1'
const LEGACY_SYNC_KEY = 'meal-planner-sync-state-v2'

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

function readLegacyLocalStorage(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    return raw ? normalizeState(JSON.parse(raw) as AppState) : null
  } catch {
    return null
  }
}

export async function loadLocalState(): Promise<AppState> {
  try {
    const stored = await readIndexedDB<AppState>(STATE_KEY)
    if (stored) return normalizeState(stored)
    const legacy = readLegacyLocalStorage()
    if (legacy) {
      await writeIndexedDB(STATE_KEY, legacy)
      localStorage.removeItem(LEGACY_KEY)
      return legacy
    }
    return normalizeState({})
  } catch {
    return readLegacyLocalStorage() ?? normalizeState({})
  }
}

export async function cacheState(state: AppState): Promise<void> {
  try {
    await writeIndexedDB(STATE_KEY, state)
  } catch {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(state))
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

export async function hasStoredLocalState(): Promise<boolean> {
  if (localStorage.getItem(LEGACY_KEY) !== null || localStorage.getItem(LEGACY_SYNC_KEY) !== null) return true
  try {
    return (await readIndexedDB<AppState>(STATE_KEY)) !== null
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

export async function loadLocalSyncSnapshot(): Promise<LocalSyncSnapshot | null> {
  try {
    const stored = await readIndexedDB<LocalSyncSnapshot>(SYNC_STATE_KEY)
    if (stored) return normalizeSyncSnapshot(stored)
    const legacyRaw = localStorage.getItem(LEGACY_SYNC_KEY)
    return legacyRaw ? normalizeSyncSnapshot(JSON.parse(legacyRaw) as LocalSyncSnapshot) : null
  } catch {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_SYNC_KEY)
      return legacyRaw ? normalizeSyncSnapshot(JSON.parse(legacyRaw) as LocalSyncSnapshot) : null
    } catch {
      return null
    }
  }
}

export async function cacheLocalSyncSnapshot(snapshot: LocalSyncSnapshot): Promise<void> {
  const normalized = normalizeSyncSnapshot(snapshot)
  try {
    await Promise.all([
      writeIndexedDB(SYNC_STATE_KEY, normalized),
      writeIndexedDB(STATE_KEY, normalized.workingState),
    ])
    localStorage.removeItem(LEGACY_SYNC_KEY)
  } catch {
    localStorage.setItem(LEGACY_SYNC_KEY, JSON.stringify(normalized))
    localStorage.setItem(LEGACY_KEY, JSON.stringify(normalized.workingState))
  }
}

export async function resetLocalState(): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(STATE_KEY)
      tx.objectStore(STORE_NAME).delete(SYNC_STATE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } finally {
    localStorage.removeItem(LEGACY_KEY)
    localStorage.removeItem(LEGACY_SYNC_KEY)
  }
}
