import * as fulfillments from '#db/fulfillments/repo.ts'
import * as methodService from '#logistics/fulfillments/methods/service.ts'
import * as pickups from '#db/fulfillments/pickups/repo.ts'
import * as directs from '#db/fulfillments/directs/repo.ts'
import * as dropoffs from '#db/fulfillments/dropoffs/repo.ts'
import * as shipmentLinks from '#db/fulfillments/shipments/repo.ts'
import * as shipments from '#db/shipping/shipments/repo.ts'
import * as parcel from '#logistics/shipping/parcel.ts'
import * as handoffsService from '#logistics/shipping/handoffs/service.ts'
import * as orders from '#db/orders/repo.ts'
import * as rules from '#logistics/fulfillments/rules.ts'
import * as addressService from '#accounts/places/addresses/service.ts'
import * as checkoutRows from '#db/checkout/checkouts/repo.ts'
import { withDecisions } from '#shared/views.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  Direction,
  FulfillmentCategory,
  FulfillmentPatchBody,
  FulfillmentStatus,
  FulfillmentStep,
  FulfillmentView,
  FulfillmentViewFacts,
} from '@dorado/contracts'

async function decide(
  rows: FulfillmentViewFacts[],
  executor?: Executor
): Promise<FulfillmentView[]> {
  if (rows.length === 0) return []
  const handoffs = await handoffsService.getHandoffs(null, executor)
  return rows.map((row) => withDecisions(row, rules.decisionsFor(row, handoffs)))
}

async function viewOne(
  id: string | null,
  order_id: string | null,
  executor?: Executor
): Promise<FulfillmentView | null> {
  const rows = await fulfillments.view(
    id === null ? null : [id],
    order_id,
    false,
    null,
    null,
    null,
    executor
  )
  return (await decide(rows, executor))[0] ?? null
}

export async function getForOrder(
  order_id: string,
  userId: string | null,
  isAdmin: boolean,
  executor?: Executor
): Promise<FulfillmentView | null> {
  if (!isAdmin) {
    const owner = await orders.ownerOf(order_id, executor)
    if (!owner || owner !== userId) return null
  }
  return await viewOne(null, order_id, executor)
}

export async function getById(id: string, executor?: Executor): Promise<FulfillmentView | null> {
  return await viewOne(id, null, executor)
}

export async function getForRefiningOrder(
  refining_order_id: string,
  executor?: Executor
): Promise<FulfillmentView | null> {
  const row = await fulfillments.getByRefiningOrder(refining_order_id, executor)
  if (!row) return null
  return await viewOne(row.id, null, executor)
}

export async function getSchedule(
  from: string | null,
  to: string | null,
  employee_id: string | null,
  executor?: Executor
): Promise<FulfillmentView[]> {
  return await decide(
    await fulfillments.view(null, null, true, from, to, employee_id, executor),
    executor
  )
}

async function createFulfillment(
  order_id: string,
  method_id: string,
  executor?: Executor
): Promise<FulfillmentView> {
  rules.assertFulfillable(await orders.exists(order_id, executor), order_id)

  const made = await fulfillments.create(order_id, method_id, 'PENDING', executor)
  const id = made?.id ?? null
  const view = await viewOne(id, id === null ? order_id : null, executor)
  rules.assertComposed(view, order_id)
  return view
}

export async function createDraft(
  method_id: string,
  direction: Direction,
  executor?: Executor
): Promise<FulfillmentView> {
  await methodService.assertOffered(method_id, direction, executor)
  const method = await methodService.getOne(method_id, executor)
  rules.assertMethod(method, method_id)

  const row = await fulfillments.createDraft(method_id, executor)
  await ensureDetail(row.id, method.category, direction, executor)
  const view = await viewOne(row.id, null, executor)
  rules.assertComposed(view, row.id)
  return view
}

async function ensureDetail(
  fulfillment_id: string,
  category: FulfillmentCategory,
  direction: Direction,
  executor?: Executor
): Promise<void> {
  if (category === 'SHIPMENT') {
    if (await shipmentLinks.existsFor(fulfillment_id, executor)) return
    const shipment_id = await parcel.createShell(
      direction === 'sale' ? 'Outbound' : 'Inbound',
      executor
    )
    await shipmentLinks.create({ fulfillment_id, shipment_id }, executor)
    return
  }
  if (category === 'PICKUP') {
    if (await pickups.getFor(fulfillment_id, executor)) return
    await pickups.create({ fulfillment_id }, executor)
    return
  }
  if (category === 'DROPOFF') {
    if (await dropoffs.getFor(fulfillment_id, executor)) return
    await dropoffs.create({ fulfillment_id }, executor)
    return
  }
  if (await directs.getFor(fulfillment_id, executor)) return
  await directs.create({ fulfillment_id }, executor)
}

export async function ownerOf(fulfillment_id: string, executor?: Executor): Promise<string | null> {
  const checkout = await checkoutRows.findByFulfillment(fulfillment_id, executor)
  return checkout?.user_id ?? (await orderOwnerOf(fulfillment_id, executor))
}

async function ownerNaming(fulfillment_id: string, executor?: Executor): Promise<string> {
  const owner = await ownerOf(fulfillment_id, executor)
  rules.assertFulfillmentOwner(owner, fulfillment_id)
  return owner
}

async function assertAddressIsTheirs(
  owner: string,
  address_id: string,
  executor?: Executor
): Promise<void> {
  const book = await addressService.list(owner, executor)
  rules.assertAddressIsTheirs(
    book.some((entry) => entry.address.id === address_id),
    address_id
  )
}

export async function patchChoices(
  id: string,
  body: FulfillmentPatchBody,
  executor?: Executor
): Promise<FulfillmentView> {
  const row = await fulfillments.getOne(id, executor)
  rules.assertFulfillment(row, id)
  const method = await methodService.getOne(row.method_id, executor)
  rules.assertMethod(method, row.method_id)

  if ('shipment' in body) {
    rules.assertChoicesMatchCategory(method.category, 'SHIPMENT', id)
    const [link] = await shipmentLinks.getFor(id, executor)
    rules.assertParcel(link, id)
    if (body.shipment.shipper_address_id != null || body.shipment.recipient_address_id != null) {
      const owner = await ownerNaming(id, executor)
      if (body.shipment.shipper_address_id != null) {
        await assertAddressIsTheirs(owner, body.shipment.shipper_address_id, executor)
      }
      if (body.shipment.recipient_address_id != null) {
        await assertAddressIsTheirs(owner, body.shipment.recipient_address_id, executor)
      }
      rules.assertOwnerClaimed(
        await shipments.claimOwner(link.shipment_id, owner, executor),
        link.shipment_id
      )
    }
    await parcel.applyChoices(link.shipment_id, body.shipment, executor)
  } else if ('pickup' in body) {
    rules.assertChoicesMatchCategory(method.category, 'PICKUP', id)
    if (body.pickup.pickup_address_id != null) {
      const owner = await ownerNaming(id, executor)
      await assertAddressIsTheirs(owner, body.pickup.pickup_address_id, executor)
      rules.assertOwnerClaimed(await pickups.claimOwner(id, owner, executor), id)
    }
    rules.assertTimestamp(body.pickup.start_time)
    await pickups.update(id, body.pickup, executor)
  } else if ('dropoff' in body) {
    rules.assertChoicesMatchCategory(method.category, 'DROPOFF', id)
    rules.assertTimestamp(body.dropoff.start_time)
    if (await dropoffs.getFor(id, executor)) {
      rules.assertApplied(
        await dropoffs.update(id, body.dropoff, executor),
        `fulfillment ${id} drop-off`
      )
    } else {
      await dropoffs.create({ fulfillment_id: id, ...body.dropoff }, executor)
    }
  } else {
    rules.assertChoicesMatchCategory(method.category, 'DIRECT', id)
    rules.assertTimestamp(body.direct.start_time)
    await directs.update(id, body.direct, executor)
  }

  return await recompose(id, executor)
}

export async function missing(
  fulfillment_id: string,
  executor?: Executor
): Promise<FulfillmentStep[]> {
  return (await getById(fulfillment_id, executor))?.missing ?? []
}

export async function addressIdOf(
  fulfillment_id: string,
  executor?: Executor
): Promise<string | null> {
  const view = await getById(fulfillment_id, executor)
  if (!view) return null
  if (view.method.category === 'SHIPMENT') return view.parcel?.shipper_address_id ?? null
  if (view.method.category === 'PICKUP') return view.pickup?.pickup_address_id ?? null
  return null
}

export async function shipmentIdOf(
  fulfillment_id: string,
  executor?: Executor
): Promise<string | null> {
  const [link] = await shipmentLinks.getFor(fulfillment_id, executor)
  return link?.shipment_id ?? null
}

export async function orderOwnerOf(
  fulfillment_id: string,
  executor?: Executor
): Promise<string | null> {
  const row = await fulfillments.getOne(fulfillment_id, executor)
  if (!row?.order_id) return null
  return (await orders.ownerOf(row.order_id, executor)) ?? null
}

export async function attachToOrder(
  fulfillment_id: string,
  order_id: string,
  executor?: Executor
): Promise<FulfillmentView> {
  rules.assertFulfillable(await orders.exists(order_id, executor), order_id)
  const changed = await fulfillments.update(fulfillment_id, { order_id }, executor)
  rules.assertDraft(changed, fulfillment_id)
  return await recompose(fulfillment_id, executor)
}

async function recompose(id: string, executor?: Executor): Promise<FulfillmentView> {
  const row = await getById(id, executor)
  rules.assertComposed(row, id)
  return row
}

export async function choose(
  order_id: string,
  method_id: string,
  direction: Direction,
  executor?: Executor
): Promise<FulfillmentView> {
  await methodService.assertOffered(method_id, direction, executor)
  return await createFulfillment(order_id, method_id, executor)
}

export async function chooseById(
  order_id: string,
  method_id: string,
  executor?: Executor
): Promise<FulfillmentView> {
  return await createFulfillment(order_id, method_id, executor)
}

export async function chooseDefault(
  order_id: string,
  direction: Direction,
  category: FulfillmentCategory,
  executor?: Executor
): Promise<FulfillmentView> {
  const method = await methodService.getDefault(direction, category, executor)
  return await createFulfillment(order_id, method.id, executor)
}

export async function setStatus(
  id: string,
  status: FulfillmentStatus,
  executor?: Executor
): Promise<FulfillmentView | null> {
  const changed = await fulfillments.update(id, { status }, executor)
  if (!changed) return null
  if (status === 'IN_TRANSIT' || status === 'DROPPED_OFF') {
    const held = await dropoffs.getFor(id, executor)
    if (held) {
      await dropoffs.update(
        id,
        status === 'IN_TRANSIT'
          ? { departed_at: new Date().toISOString() }
          : {
              departed_at: held.departed_at ?? new Date().toISOString(),
              dropped_off_at: new Date().toISOString(),
            },
        executor
      )
    }
  }
  return await getById(id, executor)
}

export async function moveStatus(
  id: string,
  status: FulfillmentStatus,
  executor?: Executor
): Promise<FulfillmentView | null> {
  const current = await getById(id, executor)
  rules.assertFulfillment(current, id)
  rules.assertTransition(current.actions.transitions, status, id)
  return await setStatus(id, status, executor)
}

export async function setMethod(
  id: string,
  method_id: string,
  executor?: Executor
): Promise<FulfillmentView> {
  const target = await methodService.getOne(method_id, executor)
  rules.assertMethod(target, method_id)

  const current = await fulfillments.getOne(id, executor)
  rules.assertFulfillment(current, id)

  const currentMethod = await methodService.getOne(current.method_id, executor)
  if (currentMethod) {
    const view = await getById(id, executor)
    rules.assertMovable(
      currentMethod.category,
      target.category,
      view?.actions.categories.length === 1,
      id
    )
  }

  await fulfillments.update(id, { method_id }, executor)

  if (target.category !== 'PICKUP') await pickups.remove(id, executor)
  if (target.category !== 'DIRECT') await directs.remove(id, executor)
  if (target.category !== 'DROPOFF') await dropoffs.remove(id, executor)
  await ensureDetail(id, target.category, target.direction ?? 'purchase', executor)

  return await recompose(id, executor)
}

export async function categoryOfOrder(
  order_id: string,
  executor?: Executor
): Promise<FulfillmentCategory | null> {
  const row = await fulfillments.getByOrder(order_id, executor)
  if (!row) return null
  return (await methodService.getOne(row.method_id, executor))?.category ?? null
}

export async function linkReturn(
  order_id: string,
  shipment_id: string,
  tx: Executor
): Promise<void> {
  const row = await fulfillments.getByOrder(order_id, tx)
  rules.assertFulfillment(row, order_id)
  await shipmentLinks.upsert(row.id, shipment_id, {}, tx)
}

export async function assertCategory(
  fulfillment_id: string,
  category: FulfillmentCategory,
  executor?: Executor
): Promise<void> {
  const row = await fulfillments.getOne(fulfillment_id, executor)
  rules.assertFulfillment(row, fulfillment_id)
  const method = await methodService.getOne(row.method_id, executor)
  rules.assertMethod(method, row.method_id)
  rules.assertIsCategory(method.category, category, fulfillment_id)
}

export async function cancelSchedule(
  fulfillment_id: string,
  executor?: Executor
): Promise<FulfillmentView | null> {
  await pickups.remove(fulfillment_id, executor)
  await directs.remove(fulfillment_id, executor)
  await dropoffs.remove(fulfillment_id, executor)
  return await getById(fulfillment_id, executor)
}

export async function createForOrder(
  order_id: string,
  method_id: string | null,
  executor?: Executor
): Promise<FulfillmentView> {
  const existing = await fulfillments.getByOrder(order_id, executor)
  if (existing) return await recompose(existing.id, executor)
  const direction = (await orders.directionOf(order_id, executor)) ?? 'purchase'
  const chosen = method_id ?? (await methodService.getDefault(direction, 'SHIPMENT', executor)).id
  const method = await methodService.getOne(chosen, executor)
  rules.assertMethod(method, chosen)
  const view = await createFulfillment(order_id, chosen, executor)
  await ensureDetail(view.fulfillment.id, method.category, direction, executor)
  return await recompose(view.fulfillment.id, executor)
}

export async function createForRefiningOrder(
  refining_order_id: string,
  method_id: string | null,
  executor?: Executor
): Promise<FulfillmentView> {
  const existing = await fulfillments.getByRefiningOrder(refining_order_id, executor)
  if (existing) return await recompose(existing.id, executor)
  const chosen = method_id ?? (await methodService.dropoffMethodId(executor))
  const method = await methodService.getOne(chosen, executor)
  rules.assertMethod(method, chosen)
  const made = await fulfillments.createForRefining(refining_order_id, chosen, 'PENDING', executor)
  rules.assertComposed(made, refining_order_id)
  await ensureDetail(made.id, method.category, 'purchase', executor)
  return await recompose(made.id, executor)
}
