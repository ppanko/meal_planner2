import type { AppState } from '../types'
import { normalizeState } from './normalizeState'

const DB_NAME = 'meal-planner-db'
const DB_VERSION = 1
const STORE_NAME = 'app'
const STATE_KEY = 'state'
const LEGACY_KEY = 'meal-planner-state-v1'

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

async function readIndexedDB(): Promise<AppState | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(STATE_KEY)
    request.onsuccess = () => resolve((request.result as AppState | undefined) ?? null)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function writeIndexedDB(state: AppState): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(state, STATE_KEY)
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
    const stored = await readIndexedDB()
    if (stored) return normalizeState(stored)
    const legacy = readLegacyLocalStorage()
    if (legacy) {
      await writeIndexedDB(legacy)
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
    await writeIndexedDB(state)
  } catch {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(state))
  }
}

export async function resetLocalState(): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(STATE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } finally {
    localStorage.removeItem(LEGACY_KEY)
  }
}
