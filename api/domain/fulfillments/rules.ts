// WHAT A FULFILLMENT MEANS, as pure functions over rows already loaded.
// Nothing here reads a database, so every rule is testable without Postgres.
//
// These were the browser's. A drawer read the bare fulfillments row, resolved
// its method off a cached list, branched on `category` to know which child to
// fetch, and decided for itself whether a booking could be cancelled. The
// decisions are the business's, so they are the server's.
import { Conflict, NotFound } from "#shared/errors.ts";
import type {
  FulfillmentActions, FulfillmentCategory, FulfillmentDirect, FulfillmentMethod,
  FulfillmentPickup, FulfillmentView,
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
