import type { AppState, KitchenPurchaseEvent } from '../types'

export type { KitchenPurchaseEvent } from '../types'

export type KitchenPurchaseEventInput = Omit<KitchenPurchaseEvent, 'eventId' | 'purchasedAt'> & {
  eventId?: string
  purchasedAt?: string
}

type SupabaseError = { message?: string; code?: string } | null
type SupabaseInsertResult = { error: SupabaseError }

type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<SupabaseInsertResult>
  }
}

function cleanOptional(value: string | null): string | null {
  if (value === null) return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned || null
}

export function createKitchenPurchaseEvent(input: KitchenPurchaseEventInput): KitchenPurchaseEvent {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Kitchen purchase event requires a name')
  return {
    eventId: input.eventId ?? crypto.randomUUID(),
    householdId: input.householdId.trim() || 'household',
    ingredientId: cleanOptional(input.ingredientId),
    name,
    quantity: input.quantity,
    unit: cleanOptional(input.unit),
    shoppingCategoryId: cleanOptional(input.shoppingCategoryId),
    purchasedAt: input.purchasedAt ?? new Date().toISOString(),
  }
}

export function appendPendingKitchenPurchaseEvent(
  state: AppState,
  event: KitchenPurchaseEvent,
): AppState {
  if (state.pendingKitchenPurchaseEvents.some((candidate) => candidate.eventId === event.eventId)) return state
  return {
    ...state,
    pendingKitchenPurchaseEvents: [...state.pendingKitchenPurchaseEvents, event],
  }
}

export async function enqueueKitchenPurchaseEvent(
  client: SupabaseLike,
  event: KitchenPurchaseEvent,
): Promise<void> {
  const { error } = await client.from('kitchen_purchase_outbox').insert({
    household_id: event.householdId,
    event_id: event.eventId,
    ingredient_id: event.ingredientId,
    name: event.name,
    quantity: event.quantity,
    unit: event.unit,
    shopping_category_id: event.shoppingCategoryId,
    purchased_at: event.purchasedAt,
  })
  if (error && error.code !== '23505') {
    const failure = new Error(error.message || 'Could not enqueue kitchen purchase event')
    Object.assign(failure, { code: error.code })
    throw failure
  }
}

export async function flushKitchenPurchaseEvents(
  client: SupabaseLike,
  events: KitchenPurchaseEvent[],
): Promise<{ sentEventIds: string[] }> {
  const sentEventIds: string[] = []
  for (const event of events) {
    try {
      await enqueueKitchenPurchaseEvent(client, event)
      sentEventIds.push(event.eventId)
    } catch {
      break
    }
  }
  return { sentEventIds }
}
