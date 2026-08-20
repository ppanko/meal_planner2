import type { AppState } from '../types'

export type RemoteStateSnapshot = {
  state: AppState
  revision: number
  updatedAt: string | null
  updatedBy: string | null
}

export type PendingStateChange = {
  id: string
  baseState: AppState
  nextState: AppState
  createdAt: string
  requiresReview?: boolean
}

export type LocalSyncSnapshot = {
  workingState: AppState
  confirmedState: AppState
  revision: number
  pendingChanges: PendingStateChange[]
}

export type LoadedSyncState = LocalSyncSnapshot & {
  remoteAvailable: boolean
}

export type RemoteWriteResult =
  | { status: 'saved'; snapshot: RemoteStateSnapshot }
  | { status: 'conflict'; snapshot: RemoteStateSnapshot }

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict'

export type SyncConflict = {
  paths: string[]
  canSaveMealCopy: boolean
}
