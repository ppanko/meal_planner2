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
import { useHouseholdSession } from '../households/HouseholdContext'

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
  const { stateId } = useHouseholdSession()
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
  const activeStateIdRef = useRef(stateId)
  const syncingRef = useRef(false)
  const syncStatusRef = useRef<SyncStatus>('saved')
  const conflictRef = useRef<InternalConflict | null>(null)
  const queuedRemoteRef = useRef<RemoteStateSnapshot | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const cacheQueueRef = useRef<Promise<void>>(Promise.resolve())

  function isActiveNamespace(namespace: string) {
    return mountedRef.current && activeStateIdRef.current === namespace
  }

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
    const namespace = stateId
    if (!workingState || !confirmed || !isActiveNamespace(namespace)) return Promise.resolve()

    const snapshot: LocalSyncSnapshot = {
      workingState: clone(workingState),
      confirmedState: clone(confirmed.state),
      revision: confirmed.revision,
      pendingChanges: clone(pendingRef.current),
    }
    cacheQueueRef.current = cacheQueueRef.current
      .catch(() => undefined)
      .then(() => cacheSyncState(namespace, snapshot))
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
    void persistSession()
  }

  async function syncPendingChanges() {
    const namespace = stateId
    if (!isActiveNamespace(namespace) || !readyRef.current || syncingRef.current || conflictRef.current) return
    if (!confirmedRef.current) return

    syncingRef.current = true
    try {
      while (
        isActiveNamespace(namespace)
        && pendingRef.current.length > 0
        && !conflictRef.current
      ) {
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
          void persistSession()
          continue
        }

        setSyncStatus('saving')
        try {
          await persistSession()
          const result = await saveState(namespace, localMerge.state, latest.revision, change.id)
          if (!isActiveNamespace(namespace)) return

          if (result.status === 'conflict') {
            confirmedRef.current = result.snapshot
            if (appStatesEqual(result.snapshot.state, localMerge.state)) pendingRef.current.shift()
            rebuildWorkingState()
            void persistSession()
            continue
          }

          if (result.snapshot.revision >= (confirmedRef.current?.revision ?? 0)) {
            confirmedRef.current = result.snapshot
          }
          pendingRef.current.shift()
          rebuildWorkingState()
          void persistSession()
        } catch (error) {
          if (!isActiveNamespace(namespace)) return
          console.warn('Could not sync meal-planner changes; they remain saved on this device.', error)
          setSyncStatus('offline')
          void persistSession()
          break
        }
      }

      if (
        isActiveNamespace(namespace)
        && pendingRef.current.length === 0
        && !conflictRef.current
      ) {
        setSyncStatus('saved')
        void persistSession()
      }
    } finally {
      if (isActiveNamespace(namespace)) {
        syncingRef.current = false
        if (
          pendingRef.current.length > 0
          && !conflictRef.current
          && syncStatusRef.current === 'saving'
        ) {
          queueMicrotask(() => void syncPendingChanges())
        }
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
      void persistSession()
      return
    }

    rebuildWorkingState()
    void persistSession()
    void syncPendingChanges()
  }

  useEffect(() => {
    mountedRef.current = true
    activeStateIdRef.current = stateId
    let active = true

    stateRef.current = null
    confirmedRef.current = null
    pendingRef.current = []
    readyRef.current = false
    syncingRef.current = false
    conflictRef.current = null
    queuedRemoteRef.current = null
    cacheQueueRef.current = Promise.resolve()
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    setState(null)
    setStorageReady(false)
    setUndoAction(null)
    setSyncConflict(null)
    setConflictVisible(false)
    setSyncStatus('saved')

    void loadSyncState(stateId).then((loaded) => {
      if (!active || !isActiveNamespace(stateId)) return
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
      else void persistSession()
    })

    const unsubscribe = subscribeToRemoteState(stateId, (snapshot) => {
      if (isActiveNamespace(stateId)) acceptRemoteSnapshot(snapshot)
    })
    const retry = () => {
      if (!isActiveNamespace(stateId)) return
      if (pendingRef.current.length > 0 && !conflictRef.current) {
        setSyncStatus('saving')
        void syncPendingChanges()
      } else if (syncStatusRef.current === 'offline') {
        void refreshRemoteState(stateId)
          .then((snapshot) => {
            if (!snapshot || !isActiveNamespace(stateId)) return
            confirmedRef.current = snapshot
            setWorkingState(snapshot.state)
            setSyncStatus('saved')
            void persistSession()
          })
          .catch(() => undefined)
      }
    }
    window.addEventListener('online', retry)

    return () => {
      active = false
      readyRef.current = false
      if (activeStateIdRef.current === stateId) activeStateIdRef.current = ''
      window.removeEventListener('online', retry)
      unsubscribe()
    }
  }, [stateId])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      activeStateIdRef.current = ''
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
    void persistSession()
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
    void persistSession()
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
