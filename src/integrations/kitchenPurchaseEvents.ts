export type KitchenPurchaseEvent = {
  eventId: string
  householdId: string
  ingredientId: string | null
  name: string
  quantity: number | null
  unit: string | null
  shoppingCategoryId: string | null
  purchasedAt: string
}

export type KitchenPurchaseEventInput = Omit<KitchenPurchaseEvent, 'eventId' | 'purchasedAt'> & {
  eventId?: string
  purchasedAt?: string
}

type SupabaseInsertResult = { error: { message?: string } | null }

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
  if (error) throw new Error(error.message || 'Could not enqueue kitchen purchase event')
}
