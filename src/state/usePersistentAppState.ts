import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import type {
  LocalSyncSnapshot,
  PendingStateChange,
  RemoteStateSnapshot,
  SyncConflict,
  SyncStatus,
} from '../sync/syncTypes'
import {
  addConflictingMealCopy,
  appStatesEqual,
  conflictingMealId,
  mergeAppStates,
} from '../sync/mergeAppState'
import {
  cacheSyncState,
  loadSyncState,
  normalizeState,
  refreshRemoteState,
  saveState,
  subscribeToRemoteState,
} from '../storage'
import { clone } from '../utils/clone'

export type UndoAction = {
  message: string
  beforeState: AppState
  afterState: AppState
}

type InternalConflict = {
  changeId: string
  latest: RemoteStateSnapshot
  localState: AppState
  remoteState: AppState
  sourceState: AppState
  mealId: string | null
}

export function usePersistentAppState() {
  const [state, setState] = useState<AppState | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>('saved')
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null)
  const [conflictVisible, setConflictVisible] = useState(false)
  const stateRef = useRef<AppState | null>(null)
  const confirmedRef = useRef<RemoteStateSnapshot | null>(null)
  const pendingRef = useRef<PendingStateChange[]>([])
  const readyRef = useRef(false)
  const mountedRef = useRef(true)
  const syncingRef = useRef(false)
  const syncStatusRef = useRef<SyncStatus>('saved')
  const conflictRef = useRef<InternalConflict | null>(null)
  const queuedRemoteRef = useRef<RemoteStateSnapshot | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const cacheQueueRef = useRef<Promise<void>>(Promise.resolve())

  function setSyncStatus(next: SyncStatus) {
    syncStatusRef.current = next
    if (mountedRef.current) setSyncStatusState(next)
  }

  function setWorkingState(next: AppState) {
    stateRef.current = next
    if (mountedRef.current) setState(next)
  }

  function rebuildWorkingState() {
    const confirmed = confirmedRef.current
    if (!confirmed) return stateRef.current

    let working = confirmed.state
    for (const change of pendingRef.current) {
      working = mergeAppStates(change.baseState, change.nextState, working, 'local').state
    }
    setWorkingState(working)
    return working
  }

  function persistSession() {
    const workingState = stateRef.current
    const confirmed = confirmedRef.current
    if (!workingState || !confirmed) return Promise.resolve()

    const snapshot: LocalSyncSnapshot = {
      workingState: clone(workingState),
      confirmedState: clone(confirmed.state),
      revision: confirmed.revision,
      pendingChanges: clone(pendingRef.current),
    }
    cacheQueueRef.current = cacheQueueRef.current
      .catch(() => undefined)
      .then(() => cacheSyncState(snapshot))
    return cacheQueueRef.current
  }

  function exposeConflict(
    change: PendingStateChange,
    latest: RemoteStateSnapshot,
    localState: AppState,
    remoteState: AppState,
    paths: string[],
  ) {
    const conflictingId = conflictingMealId(paths)
    const mealId = conflictingId && change.nextState.meals.some((meal) => meal.id === conflictingId)
      ? conflictingId
      : null
    conflictRef.current = {
      changeId: change.id,
      latest,
      localState,
      remoteState,
      sourceState: change.nextState,
      mealId,
    }
    setSyncConflict({ paths, canSaveMealCopy: Boolean(mealId) })
    setConflictVisible(true)
    setSyncStatus('conflict')
    rebuildWorkingState()
    persistSession()
  }

  async function syncPendingChanges() {
    if (!readyRef.current || syncingRef.current || conflictRef.current) return
    if (!confirmedRef.current) return

    syncingRef.current = true
    try {
      while (pendingRef.current.length > 0 && !conflictRef.current) {
        const change = pendingRef.current[0]
        const latest = confirmedRef.current!
        const localMerge = mergeAppStates(change.baseState, change.nextState, latest.state, 'local')

        if (change.requiresReview) {
          exposeConflict(change, latest, change.nextState, latest.state, ['state'])
          break
        }

        if (localMerge.conflicts.length > 0) {
          const remoteMerge = mergeAppStates(change.baseState, change.nextState, latest.state, 'remote')
          exposeConflict(change, latest, localMerge.state, remoteMerge.state, localMerge.conflicts)
          break
        }

        if (appStatesEqual(localMerge.state, latest.state)) {
          pendingRef.current.shift()
          rebuildWorkingState()
          persistSession()
          continue
        }

        setSyncStatus('saving')
        try {
          await persistSession()
          const result = await saveState(localMerge.state, latest.revision, change.id)
          if (!mountedRef.current) return

          if (result.status === 'conflict') {
            confirmedRef.current = result.snapshot
            if (appStatesEqual(result.snapshot.state, localMerge.state)) pendingRef.current.shift()
            rebuildWorkingState()
            persistSession()
            continue
          }

          if (result.snapshot.revision >= (confirmedRef.current?.revision ?? 0)) {
            confirmedRef.current = result.snapshot
          }
          pendingRef.current.shift()
          rebuildWorkingState()
          persistSession()
        } catch (error) {
          console.warn('Could not sync meal-planner changes; they remain saved on this device.', error)
          setSyncStatus('offline')
          persistSession()
          break
        }
      }

      if (pendingRef.current.length === 0 && !conflictRef.current) {
        setSyncStatus('saved')
        persistSession()
      }
    } finally {
      syncingRef.current = false
      if (
        mountedRef.current
        && pendingRef.current.length > 0
        && !conflictRef.current
        && syncStatusRef.current === 'saving'
      ) {
        queueMicrotask(() => void syncPendingChanges())
      }
    }
  }

  function acceptRemoteSnapshot(snapshot: RemoteStateSnapshot) {
    if (!readyRef.current) {
      if (!queuedRemoteRef.current || snapshot.revision > queuedRemoteRef.current.revision) {
        queuedRemoteRef.current = snapshot
      }
      return
    }
    if (snapshot.revision <= (confirmedRef.current?.revision ?? -1)) return

    confirmedRef.current = snapshot
    if (conflictRef.current) {
      conflictRef.current = null
      setSyncConflict(null)
      setConflictVisible(false)
    }

    if (pendingRef.current.length === 0) {
      setWorkingState(snapshot.state)
      setSyncStatus('saved')
      persistSession()
      return
    }

    rebuildWorkingState()
    persistSession()
    void syncPendingChanges()
  }

  useEffect(() => {
    mountedRef.current = true
    let active = true

    void loadSyncState().then((loaded) => {
      if (!active) return
      confirmedRef.current = {
        state: loaded.confirmedState,
        revision: loaded.revision,
        updatedAt: null,
        updatedBy: null,
      }
      pendingRef.current = loaded.pendingChanges
      if (loaded.pendingChanges.length > 0) rebuildWorkingState()
      else setWorkingState(loaded.workingState)
      readyRef.current = true
      setStorageReady(true)
      setSyncStatus(loaded.remoteAvailable
        ? loaded.pendingChanges.length > 0 ? 'saving' : 'saved'
        : 'offline')

      const queuedRemote = queuedRemoteRef.current
      queuedRemoteRef.current = null
      if (queuedRemote) acceptRemoteSnapshot(queuedRemote)
      if (pendingRef.current.length > 0) void syncPendingChanges()
      else persistSession()
    })

    const unsubscribe = subscribeToRemoteState(acceptRemoteSnapshot)
    const retry = () => {
      if (pendingRef.current.length > 0 && !conflictRef.current) {
        setSyncStatus('saving')
        void syncPendingChanges()
      } else if (syncStatusRef.current === 'offline') {
        void refreshRemoteState()
          .then((snapshot) => {
            if (!snapshot || !mountedRef.current) return
            confirmedRef.current = snapshot
            setWorkingState(snapshot.state)
            setSyncStatus('saved')
            persistSession()
          })
          .catch(() => undefined)
      }
    }
    window.addEventListener('online', retry)

    return () => {
      active = false
      mountedRef.current = false
      readyRef.current = false
      window.removeEventListener('online', retry)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current)
    }
  }, [])

  function update(next: AppState) {
    const current = stateRef.current
    if (!current) return
    const normalized = normalizeState(next)
    if (appStatesEqual(current, normalized)) return

    const change: PendingStateChange = {
      id: crypto.randomUUID(),
      baseState: clone(pendingRef.current.length > 0 && !syncingRef.current
        ? pendingRef.current[0].baseState
        : current),
      nextState: clone(normalized),
      createdAt: new Date().toISOString(),
    }
    if (pendingRef.current.length > 0 && !syncingRef.current && !conflictRef.current) {
      pendingRef.current = [change]
    } else {
      pendingRef.current.push(change)
    }
    setWorkingState(normalized)
    if (!conflictRef.current) setSyncStatus('saving')
    persistSession()
    void syncPendingChanges()
  }

  function updateWithUndo(next: AppState, message: string) {
    const current = stateRef.current
    if (!current) return

    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current)

    const normalized = normalizeState(next)
    setUndoAction({
      message,
      beforeState: clone(current),
      afterState: clone(normalized),
    })
    undoTimerRef.current = window.setTimeout(() => {
      setUndoAction(null)
      undoTimerRef.current = null
    }, 6000)

    update(normalized)
  }

  function undoLastAction() {
    const current = stateRef.current
    if (!undoAction || !current) return

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    const previous = mergeAppStates(
      undoAction.afterState,
      undoAction.beforeState,
      current,
      'local',
    ).state
    setUndoAction(null)
    update(previous)
  }

  function resolveConflict(resolution: 'latest' | 'device' | 'copy') {
    const conflict = conflictRef.current
    const change = pendingRef.current[0]
    if (!conflict || !change || change.id !== conflict.changeId) return

    let selected = resolution === 'device' ? conflict.localState : conflict.remoteState
    if (resolution === 'copy' && conflict.mealId) {
      selected = addConflictingMealCopy(conflict.remoteState, conflict.sourceState, conflict.mealId)
    }

    confirmedRef.current = conflict.latest
    pendingRef.current[0] = {
      ...change,
      baseState: clone(conflict.latest.state),
      nextState: clone(selected),
      requiresReview: undefined,
    }
    conflictRef.current = null
    setSyncConflict(null)
    setConflictVisible(false)
    setSyncStatus('saving')
    rebuildWorkingState()
    persistSession()
    void syncPendingChanges()
  }

  return {
    state,
    storageReady,
    undoAction,
    syncStatus,
    syncConflict,
    conflictVisible,
    update,
    updateWithUndo,
    undoLastAction,
    resolveConflict,
    deferConflict: () => setConflictVisible(false),
    reviewConflict: () => syncConflict && setConflictVisible(true),
  }
}
