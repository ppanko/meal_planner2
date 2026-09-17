import { useEffect, useRef } from 'react'
import { supabase, supabaseConfigured } from '../supabase'
import type { AppState } from '../types'
import { flushKitchenPurchaseEvents } from './kitchenPurchaseEvents'

export function useKitchenPurchaseOutbox({
  state,
  update,
}: {
  state: AppState | null
  update: (next: AppState) => void
}) {
  const stateRef = useRef(state)
  const flushingRef = useRef(false)
  stateRef.current = state

  const pendingSignature = state?.pendingKitchenPurchaseEvents.map((event) => event.eventId).join('|') ?? ''

  useEffect(() => {
    let active = true

    async function flush() {
      const current = stateRef.current
      if (!active || flushingRef.current || !supabaseConfigured || !current || current.pendingKitchenPurchaseEvents.length === 0) return

      flushingRef.current = true
      try {
        const result = await flushKitchenPurchaseEvents(supabase, current.pendingKitchenPurchaseEvents)
        if (!active || result.sentEventIds.length === 0) return

        const latest = stateRef.current
        if (!latest) return
        const sent = new Set(result.sentEventIds)
        const pendingKitchenPurchaseEvents = latest.pendingKitchenPurchaseEvents.filter(
          (event) => !sent.has(event.eventId),
        )
        if (pendingKitchenPurchaseEvents.length !== latest.pendingKitchenPurchaseEvents.length) {
          update({ ...latest, pendingKitchenPurchaseEvents })
        }
      } catch (error) {
        console.warn('Kitchen purchase events remain queued for retry.', error)
      } finally {
        flushingRef.current = false
      }
    }

    void flush()
    const retryOnline = () => void flush()
    window.addEventListener('online', retryOnline)
    return () => {
      active = false
      window.removeEventListener('online', retryOnline)
    }
  }, [pendingSignature, update])
}
