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
type NestedMethod = Pick<
  MethodRow, "id" | "type" | "label" | "admin_label" | "category" | "direction"
>;

// THE CHILDREN ARE VERBATIM ROWS (ruling 12): fulfillments.pickups, .directs
// and .shipments whole, because each is this fulfillment's OWN one-to-one
// child - not reference data. The METHOD is the opposite kind of thing:
// shared reference rows the frontend caches off GET /fulfillments/methods,
// so the WIRE carries method_id and never the object (Jacob: "we should have
// a method_id, not the method itself"). It stays nested HERE because the
// service's own logic branches on method.category; toWire() below is what
// strips it at the edge.
export type ComposedFulfillment = FulfillmentBaseRow & {
  method: NestedMethod;
  pickup: PickupRow | null;
  direct: DirectRow | null;
  shipment: ShipmentLinkRow | null;
};

// The wire shape: THE BARE fulfillments.fulfillments row, verbatim, and
// nothing else (wave-2 final form). The method object and the child rows are
// internal - the service's own logic branches on method.category and the
// schedule sorts on the booking's start time - and the children's wire homes
// are wave 3's parent-path reads (/orders/:orderId/shipments etc.).
type FulfillmentWire = Omit<ComposedFulfillment, "method" | "pickup" | "direct" | "shipment">;

export function toWire(
  { method: _m, pickup: _p, direct: _d, shipment: _s, ...row }: ComposedFulfillment
): FulfillmentWire {
  return row;
}

// The five columns the old projection built into its method object - not the
// whole row. enabled, hidden, is_default and the timestamps were never nested.
const nestMethod = (m: MethodRow): NestedMethod => ({
  id: m.id, type: m.type, label: m.label,
  admin_label: m.admin_label, category: m.category, direction: m.direction,
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

  return {
    ...f,
    method: nestMethod(method),
    pickup: d.pickups.get(f.id) ?? null,
    direct: d.directs.get(f.id) ?? null,
    shipment: d.shipmentLinks.get(f.id) ?? null,
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
