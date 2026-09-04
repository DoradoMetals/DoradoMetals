// WHAT A FULFILLMENT MEANS, as pure functions over rows already loaded.
// Nothing here reads a database, so every rule is testable without Postgres.
//
// These were the browser's. A drawer read the bare fulfillments row, resolved
// its method off a cached list, branched on `category` to know which child to
// fetch, and decided for itself whether a booking could be cancelled. The
// decisions are the business's, so they are the server's.
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type {
  CarrierHandoff, FulfillmentActions, FulfillmentCategory, FulfillmentDirect,
  FulfillmentMethod, FulfillmentParcel, FulfillmentPickup, FulfillmentStep,
  FulfillmentView,
} from "@dorado/contracts";

// AN APPOINTMENT IS A CATEGORY, NOT A METHOD. A pickup (we collect) and a
// direct (they visit) both put somebody somewhere at a time; a shipment is a
// parcel and nobody is due anywhere for it.
export function requiresSchedule(category: FulfillmentCategory): boolean {
  return category === "PICKUP" || category === "DIRECT";
}

// WHEN, read off whichever child the category points at, so no caller branches
// on category to find a time. Null is a real state: an unscheduled pickup is
// work still to be booked.
export function scheduledAt(
  pickup: Pick<FulfillmentPickup, "start_time"> | null,
  direct: Pick<FulfillmentDirect, "start_time"> | null
): string | null {
  return pickup?.start_time ?? direct?.start_time ?? null;
}

// THE CATEGORIES THIS FULFILLMENT MAY BE MOVED TO, gated exactly the way
// setMethod refuses: a fulfillment with a parcel linked to it cannot leave
// SHIPMENT, because the label is bought and cancelling it costs money and is
// a different decision. Its own category is always in the list - moving to a
// second method of the same kind is a real change.
const ALL_CATEGORIES: FulfillmentCategory[] = ["SHIPMENT", "PICKUP", "DIRECT"];

export function categoriesFor(
  category: FulfillmentCategory, hasShipment: boolean
): FulfillmentCategory[] {
  if (category === "SHIPMENT" && hasShipment) return ["SHIPMENT"];
  return ALL_CATEGORIES;
}

// WHAT MAY BE DONE, mirroring the refusal each use case throws - so a button
// that is offered is a call that is accepted.
export function actionsFor(
  method: Pick<FulfillmentMethod, "category">,
  { hasShipment, isScheduled }: { hasShipment: boolean; isScheduled: boolean }
): FulfillmentActions {
  const category = method.category;
  const categories = categoriesFor(category, hasShipment);
  return {
    // More than one category to move to is what makes the control worth
    // rendering; a locked SHIPMENT offers nothing.
    set_method: categories.length > 1,
    schedule: requiresSchedule(category),
    // Only when there is a booking to cancel - cancelSchedule on a fulfillment
    // with neither child is a write that changes nothing and says so to
    // nobody.
    cancel_schedule: requiresSchedule(category) && isScheduled,
    categories,
  };
}

// ------------------------------------------------- what the handover still owes
//
// RULING 70 (Jacob, 2026-09-04): "The only thing that should be deciding if
// fulfillments is 'ready' is fulfillments." Everything below was
// domain/checkout/rules.ts's `checkoutState`, which read nine columns of
// checkout.checkouts and branched on the chosen method's category to decide
// which of them were required. The columns are the detail rows' now
// (migration 128) and so is the decision.

// THE ONE PLACE THE TWO VOCABULARIES MEET: a carrier HANDOFF is what the
// customer picks, a fulfillment METHOD is what the row stores. Read in both
// directions so the choice and its read-back cannot drift. No carrier enum is
// spelled - the schedulable handoff is the one that means a courier is coming.
export const methodTypeFor = (handoff: CarrierHandoff): string =>
  handoff.requires_schedule ? "CARRIER PICKUP" : "CARRIER DROPOFF";

export const handoffFor = (
  handoffs: CarrierHandoff[], method_type: string | null
): CarrierHandoff | null =>
  method_type == null
    ? null
    : handoffs.find((h) => methodTypeFor(h) === method_type) ?? null;

// WHETHER A COURIER SLOT IS OWED. Only a SHIPMENT can want one, and only when
// the handoff behind the chosen method is the schedulable one - a customer
// dropping the parcel off themselves owes nobody a time.
export function requiresCourierSlot(
  method: Pick<FulfillmentMethod, "category" | "type">, handoffs: CarrierHandoff[]
): boolean {
  if (method.category !== "SHIPMENT") return false;
  return handoffFor(handoffs, method.type)?.requires_schedule === true;
}

// WHAT IS STILL NULL ON THE DETAIL ROW, in the order the customer fills it in.
// Each entry IS a column name, so a caller that renders a step and a caller
// that patches it send the same string back.
//
// INBOUND ONLY, for a SHIPMENT: an Outbound parcel leaves the business's own
// premises in the business's own box, so the customer chooses none of it - the
// only thing they pick is where it goes, which is the CHECKOUT's
// recipient_address_id and not this list's business. A missing shell owes the
// whole list, which is what a SHIPMENT with no parcel row means.
export function missingFor(
  { category, parcel, pickup, direct, needsCourierSlot }: {
    category: FulfillmentCategory;
    parcel: FulfillmentParcel | null;
    pickup: Pick<FulfillmentPickup, "pickup_address_id" | "start_time"> | null;
    direct: Pick<FulfillmentDirect, "location_id" | "start_time"> | null;
    needsCourierSlot: boolean;
  }
): FulfillmentStep[] {
  const missing: FulfillmentStep[] = [];

  if (category === "SHIPMENT") {
    if (parcel && parcel.direction !== "Inbound") return missing;
    if (!parcel?.shipper_address_id) missing.push("shipper_address_id");
    if (!parcel?.package_id) missing.push("package_id");
    if (!parcel?.carrier_service_id) missing.push("carrier_service_id");
    if (needsCourierSlot) {
      if (!parcel?.pickup_date) missing.push("pickup_date");
      if (!parcel?.pickup_time) missing.push("pickup_time");
    }
    return missing;
  }

  if (category === "PICKUP") {
    if (!pickup?.pickup_address_id) missing.push("pickup_address_id");
    if (!pickup?.start_time) missing.push("start_time");
    return missing;
  }

  if (!direct?.location_id) missing.push("location_id");
  if (!direct?.start_time) missing.push("start_time");
  return missing;
}

// WHICH DETAIL ROW A PATCH IS WRITING. The body names one of three keys; the
// fulfillment's own method says which one it is allowed to be.
export const CATEGORY_OF_CHOICES = {
  shipment: "SHIPMENT",
  pickup: "PICKUP",
  direct: "DIRECT",
} as const;

// SOONEST FIRST, NULLS LAST - deliberately: an unscheduled booking is work to
// be BOOKED, not work happening now, and JS's default comparison puts it
// first. Moved out of SQL because it sorts on a column of two joined tables.
export function byStartTimeThenId(a: FulfillmentView, b: FulfillmentView): number {
  const at = a.scheduled_at;
  const bt = b.scheduled_at;
  if (at === null && bt === null) return a.fulfillment.id.localeCompare(b.fulfillment.id);
  if (at === null) return 1;
  if (bt === null) return -1;
  const diff = new Date(at).getTime() - new Date(bt).getTime();
  return diff !== 0 ? diff : a.fulfillment.id.localeCompare(b.fulfillment.id);
}

// ----------------------------------------------------------------- refusals
//
// RULING 65: a use case states the happy path and calls one of these; no
// service file carries a `throw`. Each is the same refusal the use case used
// to raise inline, named for what it protects rather than for the shape of the
// check, so the reason survives being read out of context.
//
// The KIND is the answer: NotFound for "that does not exist", Conflict for
// "the current state forbids this". shared/middleware/errorHandler.ts maps
// them; nothing here knows a status code.

// An order id that misses is not a validation failure, it is a state one: the
// caller asked to fulfill something the orders table has never heard of.
export function assertFulfillable(exists: boolean, order_id: string): void {
  if (!exists) {
    throw new Conflict(
      `cannot fulfill order ${order_id}: it is not in orders.orders. Every order ` +
        `is created there directly now, so an id that misses is either unknown ` +
        `or a pre-migration order the backfill has not carried.`
    );
  }
}

// The one-way attach. `attached` is the write's own answer, and it is false
// only because the row already names an order - the UPDATE guards itself with
// WHERE order_id IS NULL.
export function assertDraft(attached: boolean, fulfillment_id: string): void {
  if (!attached) {
    throw new Conflict(
      `fulfillment ${fulfillment_id} is not a draft - it already belongs to an order`
    );
  }
}

export function assertFulfillment<T>(
  row: T | null | undefined, id: string
): asserts row is T {
  if (!row) throw new NotFound(`no such fulfillment: ${id}`);
}

export function assertMethod<T>(
  row: T | null | undefined, method_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no such fulfillment method: ${method_id}`);
}

// A method the menu never offered. Unenforceable by a constraint: OWN LABEL is
// a real row, hidden on purpose, and a client posting its id would otherwise
// get it.
export function assertOffered(
  offered: { id: string }[], method_id: string, direction: string
): void {
  if (!offered.some((m) => m.id === method_id)) {
    throw new Conflict(
      `fulfillment method ${method_id} is not available for a ${direction} - ` +
        `it is disabled, hidden, or belongs to the other direction`
    );
  }
}

// The seed owns the defaults, so a missing one is a hole in reference data.
// REFUSES rather than returning null: a silent null becomes a null method_id
// and a foreign key violation three calls later.
export function assertDefault<T>(
  row: T | null | undefined,
  { direction, category }: { direction: string; category: FulfillmentCategory }
): asserts row is T {
  if (!row) throw new NotFound(`no default ${category} method for a ${direction}`);
}

// The same gate `categoriesFor` reports, applied. A parcel is bought and paid
// for; moving the order off SHIPMENT while one is linked strands it.
export function assertMovable(
  from: FulfillmentCategory, to: FulfillmentCategory,
  { hasShipment, id }: { hasShipment: boolean; id: string }
): void {
  if (!categoriesFor(from, hasShipment).includes(to)) {
    throw new Conflict(
      `fulfillment ${id} already has a shipment - cancel it through domain/shipping ` +
        `before moving the order off SHIPMENT`
    );
  }
}

// A pickup row on a DROPSHIP fulfillment is a row every read attaches and none
// expects, and nothing in the schema would catch it.
export function assertIsCategory(
  found: FulfillmentCategory, wanted: FulfillmentCategory, fulfillment_id: string
): void {
  if (found !== wanted) {
    throw new Conflict(
      `fulfillment ${fulfillment_id} is a ${found}, not a ${wanted} - ` +
        `change the method before scheduling`
    );
  }
}

// The method join is INNER (see compose.ts), so a composed view can come back
// null for a row that certainly exists - its method was deleted underneath it.
// That is reference data gone missing, not a caller's mistake.
export function assertComposed<T>(
  view: T | null | undefined, id: string
): asserts view is T {
  if (!view) {
    throw new Conflict(
      `fulfillment ${id} has no method row to compose against - reference data ` +
        `is missing and this transaction must not commit`
    );
  }
}

// A PATCH aimed at the wrong detail row. The body says `pickup` and the
// fulfillment is a SHIPMENT: writing it would create a booking every read
// attaches and none expects, and nothing in the schema would catch it.
export function assertChoicesMatchCategory(
  found: FulfillmentCategory, named: FulfillmentCategory, id: string
): void {
  if (found !== named) {
    throw new Invalid(
      `fulfillment ${id} is a ${found}, not a ${named} - patch the ${found.toLowerCase()} choices`
    );
  }
}

// A SHIPMENT draft with no parcel shell. createDraft writes one for every
// category, so this is reference data or a hand-made row, not a caller's
// mistake.
export function assertParcel<T>(parcel: T | null | undefined, id: string): asserts parcel is T {
  if (!parcel) {
    throw new Conflict(
      `fulfillment ${id} is a SHIPMENT with no parcel row - it was not created as a draft`
    );
  }
}

// The draft belongs to a checkout, and only its owner may read or write it.
// Refused rather than 404: the caller reached a real fulfillment.
export function assertOwnedDraft(owner: string | null, caller: string, id: string): void {
  if (owner !== caller) {
    throw new NotFound(`no such fulfillment: ${id}`);
  }
}

// A carrier handoff the catalogue does not offer.
export function assertHandoff<T>(
  handoff: T | null | undefined, handoff_code: string
): asserts handoff is T {
  if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`);
}

// The menu has to mean something: a method type the direction does not offer
// is a step the customer was never shown.
export function assertOfferedType(
  method_id: string | undefined, type: string, direction: string
): asserts method_id is string {
  if (!method_id) throw new Invalid(`no offered ${type} method for a ${direction}`);
}

// The column is `timestamptz` and Postgres would refuse an unparseable literal
// with 22007 - a fault, not a message anyone can act on. Refused here instead,
// naming the field. It was domain/checkout/rules.ts's until 128 moved the
// column onto the booking.
export function assertTimestamp(value: unknown): void {
  if (value != null && Number.isNaN(Date.parse(String(value)))) {
    throw new Invalid(`start_time is not a timestamp`);
  }
}
