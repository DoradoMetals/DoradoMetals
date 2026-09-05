import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type {
  CarrierHandoff, FulfillmentActions, FulfillmentCategory, FulfillmentDirect,
  FulfillmentMethod, FulfillmentParcel, FulfillmentPickup, FulfillmentStep,
  FulfillmentView,
} from "@dorado/contracts";

export function requiresSchedule(category: FulfillmentCategory): boolean {
  return category === "PICKUP" || category === "DIRECT";
}

export function scheduledAt(
  pickup: Pick<FulfillmentPickup, "start_time"> | null,
  direct: Pick<FulfillmentDirect, "start_time"> | null
): string | null {
  return pickup?.start_time ?? direct?.start_time ?? null;
}

const ALL_CATEGORIES: FulfillmentCategory[] = ["SHIPMENT", "PICKUP", "DIRECT"];

export function categoriesFor(
  category: FulfillmentCategory, hasShipment: boolean
): FulfillmentCategory[] {
  if (category === "SHIPMENT" && hasShipment) return ["SHIPMENT"];
  return ALL_CATEGORIES;
}

export function actionsFor(
  method: Pick<FulfillmentMethod, "category">,
  { hasShipment, isScheduled }: { hasShipment: boolean; isScheduled: boolean }
): FulfillmentActions {
  const category = method.category;
  const categories = categoriesFor(category, hasShipment);
  return {
    set_method: categories.length > 1,
    schedule: requiresSchedule(category),
    cancel_schedule: requiresSchedule(category) && isScheduled,
    categories,
  };
}

export const methodTypeFor = (handoff: CarrierHandoff): string =>
  handoff.requires_schedule ? "CARRIER PICKUP" : "CARRIER DROPOFF";

export const handoffFor = (
  handoffs: CarrierHandoff[], method_type: string | null
): CarrierHandoff | null =>
  method_type == null
    ? null
    : handoffs.find((h) => methodTypeFor(h) === method_type) ?? null;

export function requiresCourierSlot(
  method: Pick<FulfillmentMethod, "category" | "type">, handoffs: CarrierHandoff[]
): boolean {
  if (method.category !== "SHIPMENT") return false;
  return handoffFor(handoffs, method.type)?.requires_schedule === true;
}

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

export function byStartTimeThenId(a: FulfillmentView, b: FulfillmentView): number {
  const at = a.scheduled_at;
  const bt = b.scheduled_at;
  if (at === null && bt === null) return a.fulfillment.id.localeCompare(b.fulfillment.id);
  if (at === null) return 1;
  if (bt === null) return -1;
  const diff = new Date(at).getTime() - new Date(bt).getTime();
  return diff !== 0 ? diff : a.fulfillment.id.localeCompare(b.fulfillment.id);
}

export function assertFulfillable(exists: boolean, order_id: string): void {
  if (!exists) {
    throw new Conflict(
      `cannot fulfill order ${order_id}: it is not in orders.orders. Every order ` +
        `is created there directly now, so an id that misses is either unknown ` +
        `or a pre-migration order the backfill has not carried.`
    );
  }
}

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

export function assertDefault<T>(
  row: T | null | undefined,
  { direction, category }: { direction: string; category: FulfillmentCategory }
): asserts row is T {
  if (!row) throw new NotFound(`no default ${category} method for a ${direction}`);
}

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

export function assertChoicesMatchCategory(
  found: FulfillmentCategory, named: FulfillmentCategory, id: string
): void {
  if (found !== named) {
    throw new Invalid(
      `fulfillment ${id} is a ${found}, not a ${named} - patch the ${found.toLowerCase()} choices`
    );
  }
}

export function assertParcel<T>(parcel: T | null | undefined, id: string): asserts parcel is T {
  if (!parcel) {
    throw new Conflict(
      `fulfillment ${id} is a SHIPMENT with no parcel row - it was not created as a draft`
    );
  }
}

export function assertOwnedDraft(owner: string | null, caller: string, id: string): void {
  if (owner !== caller) {
    throw new NotFound(`no such fulfillment: ${id}`);
  }
}

export function assertHandoff<T>(
  handoff: T | null | undefined, handoff_code: string
): asserts handoff is T {
  if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`);
}

export function assertOfferedType(
  method_id: string | undefined, type: string, direction: string
): asserts method_id is string {
  if (!method_id) throw new Invalid(`no offered ${type} method for a ${direction}`);
}

export function assertTimestamp(value: unknown): void {
  if (value != null && Number.isNaN(Date.parse(String(value)))) {
    throw new Invalid(`start_time is not a timestamp`);
  }
}
