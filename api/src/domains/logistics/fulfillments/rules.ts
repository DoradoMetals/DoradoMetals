import { Conflict, Forbidden, Invalid, NotFound } from '#shared/errors.ts'
import type {
  CarrierHandoff,
  FulfillmentActions,
  FulfillmentCategory,
  FulfillmentCreateBody,
  FulfillmentDecisions,
  FulfillmentMethodRead,
  FulfillmentStatus,
  FulfillmentStep,
  FulfillmentViewFacts,
} from '@dorado/contracts'

const DONE: FulfillmentStatus[] = ['PICKED_UP', 'COMPLETED', 'DROPPED_OFF']

export function isCollected(status: FulfillmentStatus | null | undefined): boolean {
  return status != null && DONE.includes(status)
}

export function transitionsFor(view: FulfillmentViewFacts): FulfillmentStatus[] {
  const status = view.fulfillment.status
  if (isCollected(status)) return []
  const category = view.method.category
  if (category === 'PICKUP') {
    if (view.pickup?.start_time == null) return []
    return status === 'IN_TRANSIT' ? ['PICKED_UP'] : ['IN_TRANSIT', 'PICKED_UP']
  }
  if (category === 'DIRECT') {
    if (view.direct?.start_time == null) return []
    return status === 'IN_PROGRESS' ? ['COMPLETED'] : ['IN_PROGRESS', 'COMPLETED']
  }
  if (category === 'DROPOFF') {
    if (view.dropoff?.start_time == null) return []
    return status === 'IN_TRANSIT' ? ['DROPPED_OFF'] : ['IN_TRANSIT', 'DROPPED_OFF']
  }
  return []
}

export function requiresSchedule(category: FulfillmentCategory): boolean {
  return category === 'PICKUP' || category === 'DIRECT' || category === 'DROPOFF'
}

const ALL_CATEGORIES: FulfillmentCategory[] = ['SHIPMENT', 'PICKUP', 'DIRECT']

export function categoriesFor(
  category: FulfillmentCategory,
  hasShipment: boolean
): FulfillmentCategory[] {
  if (category === 'DROPOFF') return ['DROPOFF']
  if (category === 'SHIPMENT' && hasShipment) return ['SHIPMENT']
  return ALL_CATEGORIES
}

export function actionsFor(view: FulfillmentViewFacts): FulfillmentActions {
  const category = view.method.category
  const categories = categoriesFor(category, view.parcel?.tracking_number != null)
  return {
    set_method: categories.length > 1,
    schedule: requiresSchedule(category),
    cancel_schedule: requiresSchedule(category) && view.scheduled_at !== null,
    categories,
    transitions: transitionsFor(view),
  }
}

export const methodTypeFor = (handoff: CarrierHandoff): string =>
  handoff.requires_schedule ? 'CARRIER PICKUP' : 'CARRIER DROPOFF'

export const handoffFor = (
  handoffs: CarrierHandoff[],
  method_type: string | null
): CarrierHandoff | null =>
  method_type == null ? null : (handoffs.find((h) => methodTypeFor(h) === method_type) ?? null)

export function requiresCourierSlot(
  method: FulfillmentMethodRead,
  handoffs: CarrierHandoff[]
): boolean {
  if (method.category !== 'SHIPMENT') return false
  return handoffFor(handoffs, method.type)?.requires_schedule === true
}

export function missingFor(
  view: FulfillmentViewFacts,
  handoffs: CarrierHandoff[]
): FulfillmentStep[] {
  const missing: FulfillmentStep[] = []
  const { method, parcel, pickup, direct, dropoff } = view

  if (method.category === 'SHIPMENT') {
    if (parcel && parcel.direction !== 'Inbound') {
      if (!parcel.carrier_service_id) missing.push('carrier_service_id')
      return missing
    }
    if (!parcel?.shipper_address_id) missing.push('shipper_address_id')
    if (!parcel?.package_id) missing.push('package_id')
    if (!parcel?.carrier_service_id) missing.push('carrier_service_id')
    if (requiresCourierSlot(method, handoffs)) {
      if (!parcel?.pickup_date) missing.push('pickup_date')
      if (!parcel?.pickup_time) missing.push('pickup_time')
    }
    return missing
  }

  if (method.category === 'PICKUP') {
    if (!pickup?.pickup_address_id) missing.push('pickup_address_id')
    if (!pickup?.start_time) missing.push('start_time')
    return missing
  }

  if (method.category === 'DROPOFF') {
    if (!dropoff?.refiner_id) missing.push('refiner_id')
    if (!dropoff?.start_time) missing.push('start_time')
    return missing
  }

  if (!direct?.location_id) missing.push('location_id')
  if (!direct?.start_time) missing.push('start_time')
  return missing
}

export function decisionsFor(
  view: FulfillmentViewFacts,
  handoffs: CarrierHandoff[]
): FulfillmentDecisions {
  return { missing: missingFor(view, handoffs), actions: actionsFor(view) }
}

export function assertOneSubject(body: FulfillmentCreateBody): void {
  const named = [body.checkout_id, body.order_id, body.refining_order_id].filter(Boolean)
  if (named.length !== 1) {
    throw new Invalid('name exactly one of checkout_id, order_id or refining_order_id')
  }
}

export function assertCheckoutSubject(
  checkout_id: string | undefined
): asserts checkout_id is string {
  if (!checkout_id)
    throw new Invalid('name exactly one of checkout_id, order_id or refining_order_id')
}

export function assertAdminCreate(is_admin: boolean): void {
  if (!is_admin) throw new Forbidden('only an admin can create a fulfillment for an order')
}

export function assertFulfillable(exists: boolean, order_id: string): void {
  if (!exists) {
    throw new Conflict(
      `cannot fulfill order ${order_id}: it is not in orders.orders. Every order ` +
        `is created there directly now, so an id that misses is either unknown ` +
        `or a pre-migration order the backfill has not carried.`
    )
  }
}

export function assertDraft(attached: boolean, fulfillment_id: string): void {
  if (!attached) {
    throw new Conflict(
      `fulfillment ${fulfillment_id} is not a draft - it already belongs to an order`
    )
  }
}

export function assertFulfillment<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no such fulfillment: ${id}`)
}

export function assertMethod<T>(row: T | null | undefined, method_id: string): asserts row is T {
  if (!row) throw new NotFound(`no such fulfillment method: ${method_id}`)
}

export function assertOffered(
  offered: FulfillmentMethodRead[],
  method_id: string,
  direction: string
): void {
  if (!offered.some((m) => m.id === method_id)) {
    throw new Conflict(
      `fulfillment method ${method_id} is not available for a ${direction} - ` +
        `it is disabled, hidden, or belongs to the other direction`
    )
  }
}

export function assertDefault<T>(
  row: T | null | undefined,
  direction: string,
  category: FulfillmentCategory
): asserts row is T {
  if (!row) throw new NotFound(`no default ${category} method for a ${direction}`)
}

export function assertTransition(
  offered: FulfillmentStatus[],
  wanted: FulfillmentStatus,
  id: string
): void {
  if (offered.length > 0 && !offered.includes(wanted)) {
    throw new Conflict(
      `fulfillment ${id} cannot move to ${wanted} - open moves are ${offered.join(', ')}`
    )
  }
}

export function assertDropoff<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) {
    throw new Conflict(`fulfillment ${id} is a DROPOFF with no drop-off row to schedule`)
  }
}

export function assertApplied(changed: unknown, what: string): void {
  if (!changed) throw new Conflict(`${what} changed nothing`)
}

export function assertMovable(
  from: FulfillmentCategory,
  to: FulfillmentCategory,
  hasShipment: boolean,
  id: string
): void {
  if (!categoriesFor(from, hasShipment).includes(to)) {
    throw new Conflict(
      `fulfillment ${id} already has a shipment - cancel it through logistics/shipping ` +
        `before moving the order off SHIPMENT`
    )
  }
}

export function assertIsCategory(
  found: FulfillmentCategory,
  wanted: FulfillmentCategory,
  fulfillment_id: string
): void {
  if (found !== wanted) {
    throw new Conflict(
      `fulfillment ${fulfillment_id} is a ${found}, not a ${wanted} - ` +
        `change the method before scheduling`
    )
  }
}

export function assertComposed<T>(view: T | null | undefined, id: string): asserts view is T {
  if (!view) {
    throw new Conflict(
      `fulfillment ${id} has no method row to compose against - reference data ` +
        `is missing and this transaction must not commit`
    )
  }
}

export function assertChoicesMatchCategory(
  found: FulfillmentCategory,
  named: FulfillmentCategory,
  id: string
): void {
  if (found !== named) {
    throw new Invalid(
      `fulfillment ${id} is a ${found}, not a ${named} - patch the ${found.toLowerCase()} choices`
    )
  }
}

export function assertParcel<T>(parcel: T | null | undefined, id: string): asserts parcel is T {
  if (!parcel) {
    throw new Conflict(
      `fulfillment ${id} is a SHIPMENT with no parcel row - it was not created as a draft`
    )
  }
}

export function assertAddressIsTheirs(theirs: boolean, address_id: string): void {
  if (!theirs) throw new NotFound(`no address ${address_id}`)
}

export function assertFulfillmentOwner(
  owner: string | null,
  fulfillment_id: string
): asserts owner is string {
  if (!owner) throw new NotFound(`no such fulfillment: ${fulfillment_id}`)
}

export function assertOwnedDraft(owner: string | null, caller: string | null, id: string): void {
  if (owner !== caller) {
    throw new NotFound(`no such fulfillment: ${id}`)
  }
}

export function assertHandoff<T>(
  handoff: T | null | undefined,
  handoff_code: string
): asserts handoff is T {
  if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`)
}

export function assertOfferedType(
  method_id: string | undefined,
  type: string,
  direction: string
): asserts method_id is string {
  if (!method_id) throw new Invalid(`no offered ${type} method for a ${direction}`)
}

export function assertTimestamp(value: unknown): void {
  if (value != null && Number.isNaN(Date.parse(String(value)))) {
    throw new Invalid(`start_time is not a timestamp`)
  }
}

export function assertOwnerClaimed(claimed: boolean, id: string): void {
  if (!claimed) {
    throw new NotFound(`${id} vanished before its owner could be stamped on it`)
  }
}
