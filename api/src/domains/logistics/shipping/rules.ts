import { convertToPounds } from '#shared/utils/convertWeights.ts'
import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type {
  CarrierHandoff,
  CarrierRateQuote,
  CarrierServiceOption,
  CheckoutRate,
  LabelService,
  FulfillmentPickup,
  InsuranceCeiling,
  OrderItem,
  Package,
  Parcel,
  ParcelSchedule,
  Shipment,
  ShipmentActions,
  ShipmentDecisions,
  ShipmentDirection,
  ShipmentViewFacts,
  ShippableCarrier,
  TrackingScan,
  TrackingStep,
} from '@dorado/contracts'

export function parcelWeightLb(
  items: Pick<OrderItem, 'pre_melt' | 'unit' | 'quantity'>[],
  pkg: Pick<Package, 'min_weight_lb'> | null | undefined
): number {
  const itemsWeight = items.reduce((sum, item) => {
    const lb = convertToPounds(Number(item.pre_melt) || 0, item.unit ?? 'g')
    return sum + lb * Number(item.quantity ?? 1)
  }, 0)
  return Math.max(itemsWeight, Number(pkg?.min_weight_lb ?? 0))
}

export function declaredValue(total: number): number {
  return Math.max(0, Number(total) || 0)
}

// What a returning parcel is worth. A purchase cancelled before it is finalized
// has no order total yet, so pricing it from the total alone sent the customer's
// metal back uninsured; the value the customer declared on the way IN is on the
// inbound parcel and is the floor (MP F5).
export function returnDeclaredValue(
  inboundDeclared: number | null | undefined,
  orderTotal: number | null | undefined
): number {
  return Math.max(declaredValue(Number(orderTotal ?? 0)), declaredValue(Number(inboundDeclared ?? 0)))
}

export function offeredRates(
  quoted: CarrierRateQuote[],
  offered: CarrierServiceOption[],
  chosen_id: string | null
): CheckoutRate[] {
  const byType = new Map(
    quoted.filter((r) => r.serviceType != null).map((r) => [r.serviceType as string, r])
  )
  return offered.map((option) => {
    const rate = byType.get(option.code)
    return {
      serviceType: option.code,
      packagingType: rate?.packagingType ?? null,
      netCharge: rate?.netCharge ?? null,
      currency: rate?.currency ?? 'USD',
      deliveryDay: rate?.deliveryDay ?? null,
      transitTime: rate?.transitTime ?? null,
      serviceDescription: rate?.serviceDescription ?? option.name,
      carrier_service_id: option.id,
      name: option.name,
      carrier_code: option.carrier_code,
      display_order: option.display_order,
      max_insured_value: option.max_insured_value,
      selected: option.id != null && option.id === chosen_id,
    }
  })
}

export function parcelFor(
  service: LabelService,
  box: Pick<Package, 'length' | 'width' | 'height'> | null | undefined,
  handoff: CarrierHandoff,
  declaredValue: number,
  weight: number,
  schedule: ParcelSchedule | null
): Parcel {
  assertParcelPackage(box)
  assertWeight(weight)
  if (handoff.requires_schedule && !schedule) {
    throw new Invalid('a carrier pickup needs a date and a time')
  }
  return {
    carrier_id: service.carrier_id,
    serviceType: service.code,
    carrierCode: service.carrier_code,
    handoff,
    declaredValue,
    weight: { units: 'LB', value: weight },
    dimensions: {
      length: Number(box.length),
      width: Number(box.width),
      height: Number(box.height),
      units: 'IN',
    },
    schedule: handoff.requires_schedule ? schedule : null,
  }
}

export function handoffFor(handoffs: CarrierHandoff[], method_type: string | null): CarrierHandoff {
  const handoff = handoffs.find((h) => h.requires_schedule === (method_type === 'CARRIER PICKUP'))
  if (!handoff) throw new Error("the carrier's handoff catalogue is missing an option")
  return handoff
}

export function scheduleFromPickup(pickup: FulfillmentPickup | undefined): ParcelSchedule | null {
  if (!pickup?.start_time) return null
  const start = new Date(pickup.start_time)
  return {
    date: start.toISOString().slice(0, 10),
    time: start.toISOString().slice(11, 16),
  }
}

// The date the carrier is told to cancel. `shipping.pickups.requested_at` is a
// timestamptz written from a bare local string, so deriving the date through
// toISOString() answers UTC's day, not the customer's (LD F15). The parcel's own
// `pickup_date` is the provider's string and is what was asked for.
export function pickupDateFor(
  parcelDate: string | null | undefined,
  requestedAt: Date | string | null
): string | null {
  if (parcelDate) return parcelDate
  if (typeof requestedAt === 'string') return requestedAt.slice(0, 10)
  return null
}

export function scheduleOf(
  date: string | null | undefined,
  time: string | null | undefined
): ParcelSchedule | null {
  return date && time ? { date, time } : null
}

export function quotedCharge(
  rates: Pick<CarrierRateQuote, 'serviceType' | 'netCharge'>[],
  serviceType: string
): number {
  const quoted = rates.find((rate) => rate.serviceType === serviceType)
  if (quoted?.netCharge == null) {
    throw new Invalid(`the carrier quoted no rate for ${serviceType} - try a different service`)
  }
  return quoted.netCharge
}

export function assertParcelPackage<T>(box: T | null | undefined): asserts box is T {
  if (!box) throw new Invalid('that package does not exist')
}

export function assertWeight(weight: number): void {
  if (!(weight > 0)) throw new Invalid('the parcel needs a weight')
}

export function assertUnlabelled(
  tracking_number: string | null | undefined,
  shipment_id: string
): void {
  if (tracking_number) throw new Conflict(`shipment ${shipment_id} already has a label`)
}

// A second cancel must not buy a second return label and orphan the first
// (LD F5). The leg that already carries a tracking number IS the cancellation.
export function assertReturnNotBought(
  tracking_number: string | null | undefined,
  order_id: string
): void {
  if (tracking_number) {
    throw new Conflict(
      `order ${order_id} has already been cancelled - its return label is ${tracking_number}`
    )
  }
}

// The claim a label purchase takes before it calls the carrier. One statement,
// so two concurrent buys cannot both pass: the loser writes no row and is told
// so here rather than paying for a second label (LD F5).
export function assertClaimed(claimed: boolean, shipment_id: string): void {
  if (!claimed) {
    throw new Conflict(
      `shipment ${shipment_id} is already having a label bought for it, or already has one`
    )
  }
}

export function assertParcelChosen(
  shipment: Pick<Shipment, 'carrier_service_id' | 'package_id'>,
  shipment_id: string
): asserts shipment is { carrier_service_id: string; package_id: string } {
  if (!shipment.carrier_service_id || !shipment.package_id) {
    throw new Invalid(`shipment ${shipment_id} has no service or package chosen yet`)
  }
}

export function assertHandoff<T>(
  handoff: T | null | undefined,
  shipment_id: string
): asserts handoff is T {
  if (!handoff) {
    throw new Invalid(`shipment ${shipment_id} names a handoff the carrier no longer offers`)
  }
}

// A return leg hangs off the order's fulfillment. No fulfillment means nothing
// records how the metal arrived, and answering "no return label needed" would
// cancel the order and quietly keep the customer's metal (LD F4 is about a
// PICKUP order, which HAS a fulfillment and correctly needs no label).
export function assertHandoverKnown<T>(category: T | null | undefined, order_id: string): asserts category is T {
  if (!category) {
    throw new NotFound(
      `order ${order_id} has no fulfillment, so there is no handover to return the metal by`
    )
  }
}

// RULING 89. A label held for collection needs a place to be held at, and that
// place is a row now. No default_return row, or one the carrier knows by no
// code, and no label is bought - the alternative is a payload naming nowhere.
export function assertReturnLocation<T>(hold: T | null | undefined): asserts hold is T {
  if (!hold) {
    throw new Invalid(
      'no places.locations row is marked default_return with a carrier location ' +
        'code, so there is nowhere to hold a label for collection'
    )
  }
}

export function assertLabelledOrder<T>(
  order: T | null | undefined,
  shipment_id: string
): asserts order is T {
  if (!order) {
    throw new NotFound(`shipment ${shipment_id} belongs to no order, so it has no parcel`)
  }
}

export const TRACKING_STAGES = ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'] as const

export function trackingTimeline(events: TrackingScan[]): TrackingStep[] {
  const seen = new Set<string>()
  const scanned: TrackingStep[] = []
  for (const e of events) {
    if (!e.status || !e.location || !e.scan_time) continue
    if (e.status === 'Label Created') continue
    const key = `${e.status}-${e.location}`
    if (seen.has(key)) continue
    seen.add(key)
    scanned.push({
      stage: e.status,
      location: e.location,
      scan_time: e.scan_time,
      reached: true,
    })
  }
  scanned.sort((a, b) => {
    const at = a.scan_time ? new Date(a.scan_time).getTime() : 0
    const bt = b.scan_time ? new Date(b.scan_time).getTime() : 0
    return at - bt
  })

  const reachedStages = new Set(scanned.map((s) => s.stage))
  const ahead = TRACKING_STAGES.filter(
    (stage, i) =>
      !reachedStages.has(stage) &&
      !TRACKING_STAGES.slice(i + 1).some((later) => reachedStages.has(later))
  ).map((stage) => ({ stage, location: null, scan_time: null, reached: false }))

  return [...scanned, ...ahead]
}

export function trackingStatus(
  shipping_status: string | null,
  timeline: TrackingStep[]
): string | null {
  if (shipping_status) return shipping_status
  const reached = timeline.filter((s) => s.reached)
  return reached.length ? reached[reached.length - 1].stage : null
}

export function awaitingHandoff(shipping_status: string | null): boolean {
  return shipping_status === 'Label Created'
}

export function shipmentActions(view: ShipmentViewFacts, isAdmin: boolean): ShipmentActions {
  const status = view.shipment.shipping_status
  const settled = status === 'Cancelled' || status === 'Delivered'
  return {
    track: Boolean(view.shipment.tracking_number) && view.carrier_id !== null,
    cancel_label: isAdmin && Boolean(view.shipment.tracking_number) && !settled,
    edit_charge: isAdmin,
    edit_tracking: isAdmin && !view.shipment.label_type,
    show_instructions: awaitingHandoff(status),
  }
}

export function shipmentDecisions(view: ShipmentViewFacts, isAdmin: boolean): ShipmentDecisions {
  const timeline = trackingTimeline(view.tracking)
  return {
    tracking_status: trackingStatus(view.shipment.shipping_status, timeline),
    timeline,
    actions: shipmentActions(view, isAdmin),
  }
}

export function assertAddress<T>(
  address: T | null | undefined,
  address_id: string
): asserts address is T {
  if (!address) throw new NotFound(`no address ${address_id}`)
}

export function assertShipment<T>(
  shipment: T | null | undefined,
  shipment_id: string
): asserts shipment is T {
  if (!shipment) throw new NotFound(`no shipment ${shipment_id}`)
}

export function assertPickup<T>(
  pickup: T | null | undefined,
  pickup_id: string
): asserts pickup is T {
  if (!pickup) throw new NotFound(`no pickup ${pickup_id}`)
}

export function assertCarrier(
  carrier_id: string | null | undefined,
  shipment_id: string
): asserts carrier_id is string {
  if (!carrier_id) {
    throw new Conflict(
      `shipment ${shipment_id} has no carrier - it has no service, so no label ` +
        `has been bought for it yet`
    )
  }
}

export function assertShippingType(direction: unknown): asserts direction is ShipmentDirection {
  if (direction !== 'Inbound' && direction !== 'Outbound' && direction !== 'Return') {
    throw new Invalid(`invalid shippingType: ${direction}`)
  }
}

export function assertRatableFulfillment<T>(
  view: T | null | undefined,
  fulfillment_id: string
): asserts view is T {
  if (!view) throw new NotFound(`no such fulfillment: ${fulfillment_id}`)
}

export function assertRatableParcel<T>(
  parcel: T | null | undefined,
  fulfillment_id: string
): asserts parcel is T {
  if (!parcel) {
    throw new Invalid(
      `fulfillment ${fulfillment_id} is not a shipment - there is no parcel to rate`
    )
  }
}

export function assertRatableCheckout<T>(
  checkout: T | null | undefined,
  fulfillment_id: string
): asserts checkout is T {
  if (!checkout) {
    throw new Invalid(
      `fulfillment ${fulfillment_id} belongs to no checkout - there is nothing to weigh`
    )
  }
}

export function assertRatableCart(count: number): void {
  if (!count) throw new Invalid('the checkout has no items to rate')
}

export function assertPackageChosen(
  package_id: string | null | undefined
): asserts package_id is string {
  if (!package_id) throw new Invalid('choose a package before requesting rates')
}

export function assertPackage<T>(box: T | null | undefined, package_id: string): asserts box is T {
  if (!box) throw new Invalid(`no package ${package_id}`)
}

export function assertAddressChosen(
  address_id: string | null | undefined
): asserts address_id is string {
  if (!address_id) throw new Invalid('choose an address before requesting rates')
}

export function assertReadyDate(readyAt: Date): void {
  if (Number.isNaN(readyAt.getTime())) {
    throw new Invalid('readyDate is required and must be a date')
  }
}

export function assertLabelFile(labelFile: string | null | undefined): asserts labelFile is string {
  if (!labelFile) {
    throw new Error(
      'the carrier created a shipment but returned no label file - the label has been cancelled'
    )
  }
}

export function assertProvider<T>(
  provider: T | null | undefined,
  code: string
): asserts provider is T {
  if (!provider) throw new Invalid(`Unsupported carrier: ${code}`)
}

export function assertBuilders<T>(
  builders: T | null | undefined,
  code: string
): asserts builders is T {
  if (!builders) throw new Invalid(`No builders registered for carrier: ${code}`)
}

export function assertCatalogue<T>(
  catalogue: T | null | undefined,
  code: string
): asserts catalogue is T {
  if (!catalogue) throw new Invalid(`No catalogue registered for carrier: ${code}`)
}

export function assertOneShippableCarrier(shippable: ShippableCarrier[]): void {
  if (shippable.length === 0) {
    throw new Conflict('No carrier has a shipping provider registered')
  }
  if (shippable.length > 1) {
    throw new Conflict(
      `More than one carrier has a shipping provider registered ` +
        `(${shippable.map((c) => c.name).join(', ')}) - the caller must say which one`
    )
  }
}

export function assertLabelService<T extends { carrier_id: string | null; name: string }>(
  row: T | null | undefined,
  carrier_service_id: string
): asserts row is T & { carrier_id: string } {
  if (!row) throw new Invalid(`no carrier service ${carrier_service_id}`)
  if (!row.carrier_id) {
    throw new Invalid(`${row.name} is a sale delivery service, not a label service`)
  }
}

// A row that names NO ceiling is not a ceiling of zero. `Number(null)` is 0 and
// 0 is finite, so one NULL row made `Math.min` answer 0, every label was bought
// with declaredValue 0 and `sealForPlacement` wrote `insured = false` on a
// parcel of metal (LD F19).
// The insurance ceiling a carrier service is offered at. A row of its own wins
// when it names a finite one; otherwise the carrier's lowest active ceiling is
// what the label may be insured for. The rows are the carrier's `shipping.services`
// (`getInsuranceCeilings`) - read with `.find`, never indexed into a Map (ruling 78).
export function lowestCeiling(rows: InsuranceCeiling[]): number {
  const values = rows
    .filter((r) => r.max_insured_value != null)
    .map((r) => Number(r.max_insured_value))
    .filter((v) => Number.isFinite(v))
  return values.length ? Math.min(...values) : 0
}

export function ceilingFor(rows: InsuranceCeiling[], name: string): number {
  const row = rows.find((r) => r.name === name)
  if (row?.max_insured_value == null) return lowestCeiling(rows)
  const own = Number(row.max_insured_value)
  return Number.isFinite(own) ? own : lowestCeiling(rows)
}

export function assertCatalogueEntry<T>(
  entry: T | null | undefined,
  name: string
): asserts entry is T {
  if (!entry) throw new Invalid(`${name} is not a label service the carrier offers`)
}

export function assertServiceId(id: string | null | undefined): asserts id is string {
  if (!id) throw new Invalid('id is required')
}

export function assertPatchNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid('the document names no field to write')
  }
}

export function assertChargeableOrder(
  order_id: string | null | undefined,
  shipment_id: string
): asserts order_id is string {
  if (!order_id) {
    throw new Invalid(`shipment ${shipment_id} belongs to no order, so it has no charge to edit`)
  }
}

export function assertPurchaseOrder(
  order_id: string | null | undefined,
  shipment_id: string
): asserts order_id is string {
  if (!order_id) {
    throw new Invalid(`shipment ${shipment_id} has no purchase order to record an actual cost on`)
  }
}

export function assertSalesOrder(
  order_id: string | null | undefined,
  shipment_id: string
): asserts order_id is string {
  if (!order_id) {
    throw new Invalid(
      `shipment ${shipment_id} has no sales order - tracking is recorded on ` +
        `sales-order shipments`
    )
  }
}

export function assertOrderForShipment<T>(
  direction: T | null | undefined,
  order_id: string
): asserts direction is T {
  if (!direction) {
    throw new NotFound(`order ${order_id} does not exist - a shipment cannot attach to it`)
  }
}
