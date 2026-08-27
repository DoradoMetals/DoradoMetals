// A fulfillment, its method, and whichever detail its method's category points
// at - assembled in memory.
//
// The implementation this replaces did it in SQL: one JOIN to methods, three
// LEFT JOINs to pickups, directs and shipments, and three CASE-wrapped
// jsonb_build_object calls in the projection. This must produce exactly the
// same shape.
//
// THE METHOD JOIN WAS INNER AND THE THREE DETAILS WERE OUTER, and both survive:
// a fulfillment whose method row is gone is dropped, and a fulfillment with no
// detail yet keeps a null in all three slots. The asymmetry is meaningful -
// method_id is NOT NULL and a fulfillment without one is nonsense, while a
// PICKUP that nobody has scheduled yet is the normal state of a new order.
//
// ONLY ONE DETAIL IS EVER PRESENT, because a fulfillment has one method and a
// method has one category. Nothing in the schema enforces that; setMethod
// deletes the detail that no longer applies, which is what keeps it true.
import type { FulfillmentBaseRow } from "#features/fulfillments/repo.ts";
import type { MethodRow } from "#features/fulfillments/methods/repo.ts";
import type { PickupRow } from "#features/fulfillments/pickups/repo.ts";
import type { DirectRow } from "#features/fulfillments/directs/repo.ts";
import type { ShipmentLinkRow } from "#features/fulfillments/shipments/repo.ts";

// The method as it is nested. A method exists independently of any fulfillment -
// the same row is referenced by every order that chose it - so it is its own
// object, by the same test that keeps organizations out of carriers.
export type NestedMethod = Pick<
  MethodRow, "id" | "type" | "label" | "admin_label" | "category" | "direction"
>;

export type NestedPickup = Pick<
  PickupRow, "id" | "pickup_address_id" | "assigned_employee_id" | "start_time" | "end_time"
>;

export type NestedDirect = Pick<
  DirectRow,
  "id" | "location_id" | "assigned_employee_id" | "is_appointment" | "start_time" | "end_time"
>;

export type NestedShipment = Pick<
  ShipmentLinkRow, "id" | "shipment_id" | "recipient_location_id" | "shipper_location_id"
>;

// method_id is DROPPED. It is projected so this file can find the method and
// is not on the wire - the old projection listed its columns explicitly and
// method_id was not among them, because the nested `method` object is the
// answer. validate:wire caught it as an undeclared field the moment the spread
// carried it through, which is the same mistake products made with metal_id.
export type ComposedFulfillment = Omit<FulfillmentBaseRow, "method_id"> & {
  method: NestedMethod;
  pickup: NestedPickup | null;
  direct: NestedDirect | null;
  shipment: NestedShipment | null;
};

// The five columns the old projection built into its method object - not the
// whole row. enabled, hidden, is_default and the timestamps were never nested.
const nestMethod = (m: MethodRow): NestedMethod => ({
  id: m.id, type: m.type, label: m.label,
  admin_label: m.admin_label, category: m.category, direction: m.direction,
});

const nestPickup = (p: PickupRow): NestedPickup => ({
  id: p.id,
  pickup_address_id: p.pickup_address_id,
  assigned_employee_id: p.assigned_employee_id,
  start_time: p.start_time,
  end_time: p.end_time,
});

const nestDirect = (d: DirectRow): NestedDirect => ({
  id: d.id,
  location_id: d.location_id,
  assigned_employee_id: d.assigned_employee_id,
  is_appointment: d.is_appointment,
  start_time: d.start_time,
  end_time: d.end_time,
});

const nestShipment = (s: ShipmentLinkRow): NestedShipment => ({
  id: s.id,
  shipment_id: s.shipment_id,
  recipient_location_id: s.recipient_location_id,
  shipper_location_id: s.shipper_location_id,
});

// Everything the details of a set of fulfillments need, keyed by fulfillment_id.
export type Details = {
  methods: Map<string, MethodRow>;
  pickups: Map<string, PickupRow>;
  directs: Map<string, DirectRow>;
  shipmentLinks: Map<string, ShipmentLinkRow>;
};

// THE FIRST ROW WINS, NOT THE LAST, AND FOR SHIPMENTS THAT IS A REAL CHOICE.
//
// pickups and directs are one per fulfillment and cannot collide. Shipments
// CAN: the unique index is on shipment_id, so a fulfillment may have several
// parcels. The projection this replaces LEFT JOINed them and would therefore
// have returned the fulfillment TWICE for an order shipped twice - a
// pre-existing bug that no dev data reaches, because nothing has two.
//
// Nesting the first keeps one row per fulfillment, which is what every caller
// expects. Returning the list instead would be a wire change and is the right
// answer one day.
export const byFulfillment = <T extends { fulfillment_id: string }>(rows: T[]): Map<string, T> => {
  const out = new Map<string, T>();
  for (const r of rows) if (!out.has(r.fulfillment_id)) out.set(r.fulfillment_id, r);
  return out;
};

export function compose(
  f: FulfillmentBaseRow, d: Details
): ComposedFulfillment | null {
  const method = d.methods.get(f.method_id);
  // The method join was INNER. A fulfillment whose method is gone is dropped
  // rather than returned with a null where every caller reads a category.
  if (!method) return null;

  const pickup = d.pickups.get(f.id);
  const direct = d.directs.get(f.id);
  const shipment = d.shipmentLinks.get(f.id);

  const { method_id: _method_id, ...rest } = f;

  return {
    ...rest,
    method: nestMethod(method),
    pickup: pickup ? nestPickup(pickup) : null,
    direct: direct ? nestDirect(direct) : null,
    shipment: shipment ? nestShipment(shipment) : null,
  };
}

export function composeAll(
  rows: FulfillmentBaseRow[], d: Details
): ComposedFulfillment[] {
  return rows.flatMap((f) => {
    const composed = compose(f, d);
    return composed ? [composed] : [];
  });
}

// ORDER BY coalesce(p.start_time, d.start_time) ASC NULLS LAST, f.id ASC.
//
// It sorted on a column of two different joined tables, so the ordering moves
// here. NULLS LAST is the part worth keeping deliberately: an unscheduled
// pickup is work to be BOOKED, not work happening now, and JavaScript's default
// comparison would put it first.
export const byStartTimeThenId = (
  a: ComposedFulfillment, b: ComposedFulfillment
): number => {
  const at = a.pickup?.start_time ?? a.direct?.start_time ?? null;
  const bt = b.pickup?.start_time ?? b.direct?.start_time ?? null;
  if (at === null && bt === null) return a.id.localeCompare(b.id);
  if (at === null) return 1;
  if (bt === null) return -1;
  const diff = new Date(at).getTime() - new Date(bt).getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
};
