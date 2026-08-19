import { sharedStateId, supabase, supabaseConfigured } from '../supabase'
import type { RemoteStateSnapshot, RemoteWriteResult } from '../sync/syncTypes'
import type { AppState } from '../types'
import { normalizeState } from './normalizeState'

type RemoteRow = {
  state?: Partial<AppState>
  revision?: number | string
  updated_at?: string | null
  updated_by?: string | null
  status?: 'saved' | 'conflict'
}

function toSnapshot(row: RemoteRow): RemoteStateSnapshot | null {
  if (!row.state) return null
  const parsedRevision = Number(row.revision ?? 0)
  return {
    state: normalizeState(row.state),
    revision: Number.isSafeInteger(parsedRevision) && parsedRevision >= 0 ? parsedRevision : 0,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  }
}

export async function readRemoteState(): Promise<RemoteStateSnapshot | null> {
  if (!supabaseConfigured) return null
  const { data, error } = await supabase
    .from('meal_planner_state')
    .select('state, revision, updated_at, updated_by')
    .eq('id', sharedStateId)
    .maybeSingle()
  if (error) throw error
  return data ? toSnapshot(data as RemoteRow) : null
}

export async function writeRemoteState(
  state: AppState,
  expectedRevision: number,
  mutationId: string,
): Promise<RemoteWriteResult> {
  if (!supabaseConfigured) {
    return {
      status: 'saved',
      snapshot: {
        state: normalizeState(state),
        revision: expectedRevision + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      },
    }
  }

  const { data, error } = await supabase.rpc('save_meal_planner_state', {
    requested_id: sharedStateId,
    requested_state: state,
    expected_revision: expectedRevision,
    mutation_id: mutationId,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as RemoteRow | null
  const snapshot = row ? toSnapshot(row) : null
  if (!row?.status || !snapshot) throw new Error('Supabase returned an invalid sync response.')
  return { status: row.status, snapshot }
}

export function subscribeToRemoteState(onState: (snapshot: RemoteStateSnapshot) => void): () => void {
  if (!supabaseConfigured) return () => undefined
  const channel = supabase
    .channel(`meal-planner-state-${sharedStateId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'meal_planner_state', filter: `id=eq.${sharedStateId}` },
      (payload) => {
        const snapshot = toSnapshot((payload.new ?? {}) as RemoteRow)
        if (snapshot) onState(snapshot)
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
