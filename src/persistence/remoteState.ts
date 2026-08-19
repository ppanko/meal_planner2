import { sharedStateId, supabase, supabaseConfigured } from '../supabase'
import type { AppState } from '../types'
import { cacheState } from './localState'
import { normalizeState } from './normalizeState'

export async function readRemoteState(): Promise<AppState | null> {
  if (!supabaseConfigured) return null
  const { data, error } = await supabase
    .from('meal_planner_state')
    .select('state')
    .eq('id', sharedStateId)
    .maybeSingle()
  if (error) throw error
  return data?.state ? normalizeState(data.state as Partial<AppState>) : null
}

export async function writeRemoteState(state: AppState): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase.from('meal_planner_state').upsert(
    { id: sharedStateId, state, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  )
  if (error) throw error
}

export function subscribeToRemoteState(onState: (state: AppState) => void): () => void {
  if (!supabaseConfigured) return () => undefined
  const channel = supabase
    .channel(`meal-planner-state-${sharedStateId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'meal_planner_state', filter: `id=eq.${sharedStateId}` },
      (payload) => {
        const row = payload.new as { state?: Partial<AppState> } | undefined
        if (!row?.state) return
        const next = normalizeState(row.state)
        void cacheState(next)
        onState(next)
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
