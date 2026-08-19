import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import { loadState, saveState, subscribeToRemoteState } from '../storage'

export type UndoAction = {
  message: string
  state: AppState
}

export function usePersistentAppState() {
  const [state, setState] = useState<AppState | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const recentLocalStatesRef = useRef<string[]>([])

  useEffect(() => {
    let mounted = true

    loadState().then((loaded) => {
      if (!mounted) return
      setState(loaded)
      setStorageReady(true)
    })

    const unsubscribe = subscribeToRemoteState((remoteState) => {
      if (!mounted) return
      const serialized = JSON.stringify(remoteState)
      if (recentLocalStatesRef.current.includes(serialized)) return
      setState(remoteState)
      setStorageReady(true)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current)
      }
    }
  }, [])

  function update(next: AppState) {
    setState(next)
    const serialized = JSON.stringify(next)
    recentLocalStatesRef.current = [...recentLocalStatesRef.current.slice(-9), serialized]
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveState(next))
  }

  function updateWithUndo(next: AppState, message: string) {
    if (!state) return

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
    }

    const snapshot: AppState = JSON.parse(JSON.stringify(state))
    setUndoAction({ message, state: snapshot })
    undoTimerRef.current = window.setTimeout(() => {
      setUndoAction(null)
      undoTimerRef.current = null
    }, 6000)

    update(next)
  }

  function undoLastAction() {
    if (!undoAction) return

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    const previous = undoAction.state
    setUndoAction(null)
    update(previous)
  }

  return {
    state,
    storageReady,
    undoAction,
    update,
    updateWithUndo,
    undoLastAction,
  }
}
