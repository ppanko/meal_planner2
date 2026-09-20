import { describe, expect, it, vi } from 'vitest'
import {
  createKitchenPurchaseEvent,
  enqueueKitchenPurchaseEvent,
} from './kitchenPurchaseEvents'

describe('kitchen purchase events', () => {
  it('normalizes payload without changing purchase quantity semantics', () => {
    const event = createKitchenPurchaseEvent({
      eventId: '00000000-0000-4000-8000-000000000001',
      householdId: 'household',
      ingredientId: null,
      name: '  Greek   yogurt ',
      quantity: 2,
      unit: ' tub ',
      shoppingCategoryId: ' dairy ',
      purchasedAt: '2026-09-17T12:00:00.000Z',
    })
    expect(event).toEqual({
      eventId: '00000000-0000-4000-8000-000000000001',
      householdId: 'household',
      ingredientId: null,
      name: 'Greek yogurt',
      quantity: 2,
      unit: 'tub',
      shoppingCategoryId: 'dairy',
      purchasedAt: '2026-09-17T12:00:00.000Z',
    })
  })

  it('inserts into the kitchen outbox and surfaces failures', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn(() => ({ insert })) }
    const event = createKitchenPurchaseEvent({
      eventId: '00000000-0000-4000-8000-000000000002',
      householdId: 'household',
      ingredientId: 'milk',
      name: 'Milk',
      quantity: 1,
      unit: 'gallon',
      shoppingCategoryId: 'dairy',
      purchasedAt: '2026-09-17T12:00:00.000Z',
    })

    await enqueueKitchenPurchaseEvent(client, event)
    expect(client.from).toHaveBeenCalledWith('kitchen_purchase_outbox')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_id: event.eventId,
      ingredient_id: 'milk',
      quantity: 1,
    }))

    insert.mockResolvedValueOnce({ error: { message: 'offline' } })
    await expect(enqueueKitchenPurchaseEvent(client, event)).rejects.toThrow('offline')
  })
})
