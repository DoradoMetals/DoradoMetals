// THE PARCEL FACTS ARE THE SERVER'S (ruling 58, Jacob: "We don't care about
// packaging weight on the frontend. Why would it live here?"). Both take rows
// already loaded; neither reads a database.
import { convertToPounds } from "#shared/utils/convertWeights.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type {
  CarrierRateQuote, CarrierServiceOption, CheckoutRate, Shipment, ShipmentActions,
  ShipmentDirection, TrackingStep,
} from "@dorado/contracts";

export type WeighableLine = {
  pre_melt: number | null;
  unit: string | null;
  quantity: number | null;
};

export type WeighableBox = { min_weight_lb: number | null } | null | undefined;

// The carrier bills whichever is larger: what the metal itself weighs, or the
// box's own minimum. A bullion line's weight is PER UNIT, so quantity scales
// it - six one-ounce coins weigh six ounces, not one.
export function parcelWeightLb(items: WeighableLine[], pkg: WeighableBox): number {
  const itemsWeight = items.reduce((sum, item) => {
    const lb = convertToPounds(Number(item.pre_melt) || 0, item.unit ?? "g");
    return sum + lb * Number(item.quantity ?? 1);
  }, 0);
  return Math.max(itemsWeight, Number(pkg?.min_weight_lb ?? 0));
}

// What the carrier is told a parcel is worth. Today's meaning, unchanged: the
// order or quote's own total (D82 - the frontend computes no money). A
// ceiling specific to a carrier service is a separate, later clamp
// (shipping/services/service.ts clampInsuredValue).
export function declaredValue(total: number): number {
  return Math.max(0, Number(total) || 0);
}

// THE RATE/CATALOGUE JOIN, which the browser used to do. A carrier answers by
// its own `serviceType`; the checkout row stores a `shipping.services` id. One
// entry per OFFERED service, in the catalogue's own display order, so a
// service the carrier priced but the business does not sell never reaches a
// screen - and a service it sells but the carrier did not price comes back
// with a null charge, which is what makes its option render disabled.
export function offeredRates(
  quoted: CarrierRateQuote[], offered: CarrierServiceOption[], chosen_id: string | null
): CheckoutRate[] {
  const byType = new Map(
    quoted.filter((r) => r.serviceType != null).map((r) => [r.serviceType as string, r])
  );
  return offered.map((option) => {
    const rate = byType.get(option.code);
    return {
      serviceType: option.code,
      packagingType: rate?.packagingType ?? null,
      netCharge: rate?.netCharge ?? null,
      currency: rate?.currency ?? "USD",
      deliveryDay: rate?.deliveryDay ?? null,
      transitTime: rate?.transitTime ?? null,
      serviceDescription: rate?.serviceDescription ?? option.name,
      carrier_service_id: option.id,
      name: option.name,
      carrier_code: option.carrier_code,
      display_order: option.display_order,
      max_insured_value: option.max_insured_value,
      selected: option.id != null && option.id === chosen_id,
    };
  });
}

// ---------------------------------------------------------------- tracking
//
// WHAT A CARRIER'S SCANS MEAN was the browser's until this pass:
// TrackingEvents.tsx held the four stages as a literal, dropped "Label
// Created", deduplicated by status+location, worked out which stages were
// still ahead and sorted the lot. Forty lines of reasoning about a carrier's
// vocabulary, in a component, with no test.

// THE STAGES A PARCEL PASSES THROUGH, in order. The carrier's own scan
// statuses are matched against these; anything else it says is a detail scan
// (an arrival at a sort facility, a weather delay) and rides the timeline as
// itself without ever becoming a stage.
export const TRACKING_STAGES = [
  "Picked Up", "In Transit", "Out for Delivery", "Delivered",
] as const;

export type ScanRow = {
  status: string | null;
  location: string | null;
  scan_time: Date | string | null;
};

const asIso = (t: Date | string | null): string | null =>
  t === null ? null : t instanceof Date ? t.toISOString() : t;

// THE PARCEL'S PROGRESS, as rungs. Scans the carrier repeats (the same status
// at the same place, which FedEx does emit) collapse to the first; "Label
// Created" is dropped because it is our own act rather than the carrier's; and
// every stage not yet reached is appended as an unreached rung so a screen
// draws the whole ladder rather than only the part already climbed.
//
// A stage is only appended if NO LATER stage has been reached: a parcel that
// is already "Out for Delivery" was picked up, whatever the scan feed says, so
// showing "Picked Up" as still-to-come would be a lie about the past.
export function trackingTimeline(events: ScanRow[]): TrackingStep[] {
  const seen = new Set<string>();
  const scanned: TrackingStep[] = [];
  for (const e of events) {
    if (!e.status || !e.location || !e.scan_time) continue;
    if (e.status === "Label Created") continue;
    const key = `${e.status}-${e.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scanned.push({
      stage: e.status, location: e.location, scan_time: asIso(e.scan_time), reached: true,
    });
  }
  scanned.sort((a, b) => {
    const at = a.scan_time ? new Date(a.scan_time).getTime() : 0;
    const bt = b.scan_time ? new Date(b.scan_time).getTime() : 0;
    return at - bt;
  });

  const reachedStages = new Set(scanned.map((s) => s.stage));
  const ahead = TRACKING_STAGES.filter(
    (stage, i) =>
      !reachedStages.has(stage) &&
      !TRACKING_STAGES.slice(i + 1).some((later) => reachedStages.has(later))
  ).map((stage) => ({ stage, location: null, scan_time: null, reached: false }));

  return [...scanned, ...ahead];
}

// THE ONE WORD FOR WHERE THE PARCEL IS. The shipment's own column when the
// carrier has said something, else the furthest stage the scans reached, else
// null - which is a real state and reads as "no label bought yet".
export function trackingStatus(
  shipping_status: string | null, timeline: TrackingStep[]
): string | null {
  if (shipping_status) return shipping_status;
  const reached = timeline.filter((s) => s.reached);
  return reached.length ? reached[reached.length - 1].stage : null;
}

// A PARCEL THE CUSTOMER IS STILL HOLDING. "Label Created" is the state between
// buying the label and the carrier's first scan, and it is the only one where
// print-pack-hand-over instructions are worth showing.
export function awaitingHandoff(shipping_status: string | null): boolean {
  return shipping_status === "Label Created";
}

// WHAT MAY BE DONE TO A PARCEL - each mirroring the refusal its use case
// throws, so a button that is offered is a call that is accepted.
//
// `track` needs both a number to ask about and a carrier to ask (getTracking
// raises Conflict without a service); `cancel_label` needs a live label, and a
// parcel already cancelled or delivered has none to cancel. `edit_tracking` is
// the hand-entered pair, which only makes sense where we bought no label of
// our own - `label_type` is the flag for that rather than the label bytes,
// which a read never carries.
export function shipmentActions(
  shipment: Pick<Shipment, "tracking_number" | "shipping_status" | "label_type">,
  { carrier_id, isAdmin }: { carrier_id: string | null; isAdmin: boolean }
): ShipmentActions {
  const status = shipment.shipping_status;
  const settled = status === "Cancelled" || status === "Delivered";
  return {
    track: Boolean(shipment.tracking_number) && carrier_id !== null,
    cancel_label: isAdmin && Boolean(shipment.tracking_number) && !settled,
    edit_charge: isAdmin,
    edit_tracking: isAdmin && !shipment.label_type,
    show_instructions: awaitingHandoff(status),
  };
}

// ----------------------------------------------------------------- refusals
//
// RULING 65: a use case states the happy path and calls one of these; no
// service file under domain/shipping carries a `throw`. Each is the refusal
// its use case used to raise inline, named for what it protects.
//
// NotFound is "that does not exist", Conflict "the current state forbids
// this", Invalid "the request cannot be acted on as sent".
// shared/middleware/errorHandler.ts maps them.

export function assertAddress<T>(
  address: T | null | undefined, address_id: string
): asserts address is T {
  if (!address) throw new NotFound(`no address ${address_id}`);
}

// Every operation that reaches a carrier resolves its shipment FIRST: an
// unknown id used to read off null after the decision to call FedEx had
// already been taken.
export function assertShipment<T>(
  shipment: T | null | undefined, shipment_id: string
): asserts shipment is T {
  if (!shipment) throw new NotFound(`no shipment ${shipment_id}`);
}

export function assertPickup<T>(
  pickup: T | null | undefined, pickup_id: string
): asserts pickup is T {
  if (!pickup) throw new NotFound(`no pickup ${pickup_id}`);
}

// A shipment's carrier comes through its SERVICE, so a shell with no service
// chosen has none - and asking `undefined` would reach the provider registry
// as "Unsupported carrier: ".
export function assertCarrier(
  carrier_id: string | null | undefined, shipment_id: string
): asserts carrier_id is string {
  if (!carrier_id) {
    throw new Conflict(
      `shipment ${shipment_id} has no carrier - it has no service, so no label ` +
        `has been bought for it yet`
    );
  }
}

// WHICH END OF THE COUNTRY THE PARCEL LEAVES FROM is decided by the direction,
// so a value outside the enum would quote from the wrong one rather than fail.
export function assertShippingType(
  direction: unknown
): asserts direction is ShipmentDirection {
  if (direction !== "Inbound" && direction !== "Outbound" && direction !== "Return") {
    throw new Invalid(`invalid shippingType: ${direction}`);
  }
}

// A RATE QUOTE NEEDS A PARCEL AND SOMEWHERE TO SEND IT. Each of these is a
// step of the checkout the customer has not taken yet, not a malformed
// request - which is why they name the step rather than the column.
export function assertRatableCart(count: number): void {
  if (!count) throw new Invalid("the checkout has no items to rate");
}

export function assertPackageChosen(
  package_id: string | null | undefined
): asserts package_id is string {
  if (!package_id) throw new Invalid("choose a package before requesting rates");
}

export function assertPackage<T>(
  box: T | null | undefined, package_id: string
): asserts box is T {
  if (!box) throw new Invalid(`no package ${package_id}`);
}

export function assertAddressChosen(
  address_id: string | null | undefined
): asserts address_id is string {
  if (!address_id) throw new Invalid("choose an address before requesting rates");
}

// JSON cannot carry a Date, so the boundary that turns a request into objects
// is also the one that finds out it was not a date at all.
export function assertReadyDate(readyAt: Date): void {
  if (Number.isNaN(readyAt.getTime())) {
    throw new Invalid("readyDate is required and must be a date");
  }
}

// A LABEL WITH NO FILE IS STILL A LABEL FEDEX HAS BILLED FOR - the caller
// cancels it before calling this, which is why the refusal says so.
export function assertLabelFile(
  labelFile: string | null | undefined
): asserts labelFile is string {
  if (!labelFile) {
    throw new Error(
      "the carrier created a shipment but returned no label file - the label has been cancelled"
    );
  }
}

// ------------------------------------------------------- the carrier itself
//
// Which carrier answers is a fact about the CODE, not a business preference:
// a carrier with no provider registered cannot be quoted, labelled or tracked.

export function assertProvider<T>(
  provider: T | null | undefined, code: string
): asserts provider is T {
  if (!provider) throw new Invalid(`Unsupported carrier: ${code}`);
}

export function assertBuilders<T>(
  builders: T | null | undefined, code: string
): asserts builders is T {
  if (!builders) throw new Invalid(`No builders registered for carrier: ${code}`);
}

export function assertCatalogue<T>(
  catalogue: T | null | undefined, code: string
): asserts catalogue is T {
  if (!catalogue) throw new Invalid(`No catalogue registered for carrier: ${code}`);
}

// Exactly one carrier may be resolved without being named. The moment a second
// is registered this refuses rather than picking, because which one becomes a
// real business question.
export function assertOneShippableCarrier(shippable: { name: string }[]): void {
  if (shippable.length === 0) {
    throw new Conflict("No carrier has a shipping provider registered");
  }
  if (shippable.length > 1) {
    throw new Conflict(
      `More than one carrier has a shipping provider registered ` +
        `(${shippable.map((c) => c.name).join(", ")}) - the caller must say which one`
    );
  }
}

// ---------------------------------------------------------------- a service
//
// A LABEL SERVICE is a row of shipping.services that the carrier's own
// catalogue also offers. Both halves have to hold: a sale delivery service
// carries no carrier at all, and a row naming one the catalogue has dropped
// would reach the provider as a service type it does not sell.
export function assertLabelService<T extends { carrier_id: string | null; name: string }>(
  row: T | null | undefined, carrier_service_id: string
): asserts row is T & { carrier_id: string } {
  if (!row) throw new Invalid(`no carrier service ${carrier_service_id}`);
  if (!row.carrier_id) {
    throw new Invalid(`${row.name} is a sale delivery service, not a label service`);
  }
}

export function assertCatalogueEntry<T>(
  entry: T | null | undefined, name: string
): asserts entry is T {
  if (!entry) throw new Invalid(`${name} is not a label service the carrier offers`);
}

export function assertServiceId(
  id: string | null | undefined
): asserts id is string {
  if (!id) throw new Invalid("id is required");
}

// ------------------------------------------------------------- a patch body

export function assertPatchNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
}

// The tracking pair travels together: a number with no carrier (or the
// reverse) is half a write.
export function assertTrackingPair(
  tracking_number: unknown, carrier_id: unknown
): void {
  if ((tracking_number === undefined) !== (carrier_id === undefined)) {
    throw new Invalid(`"tracking_number" and "carrier_id" travel together`);
  }
}

export function assertChargeableOrder(
  order_id: string | null | undefined, shipment_id: string
): asserts order_id is string {
  if (!order_id) {
    throw new Invalid(
      `shipment ${shipment_id} belongs to no order, so it has no charge to edit`
    );
  }
}

export function assertPurchaseOrder(
  order_id: string | null | undefined, shipment_id: string
): asserts order_id is string {
  if (!order_id) {
    throw new Invalid(
      `shipment ${shipment_id} has no purchase order to record an actual cost on`
    );
  }
}

export function assertSalesOrder(
  order_id: string | null | undefined, shipment_id: string
): asserts order_id is string {
  if (!order_id) {
    throw new Invalid(
      `shipment ${shipment_id} has no sales order - tracking is recorded on ` +
        `sales-order shipments`
    );
  }
}

// A shipment attaches to an order the moment it is created, so an order id
// that misses is a caller naming something that does not exist.
export function assertOrderForShipment<T>(
  direction: T | null | undefined, order_id: string
): asserts direction is T {
  if (!direction) {
    throw new NotFound(`order ${order_id} does not exist - a shipment cannot attach to it`);
  }
}
