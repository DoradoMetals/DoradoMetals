// A fulfillment, its method, and whichever detail its method's category points at - assembled in memory.
// The method join is effectively INNER (a fulfillment whose method is gone is dropped) and the three details OUTER (a null slot is normal for a new order) - only one detail is ever present, since a fulfillment has one method and a method has one category; setMethod deletes the detail that no longer applies to keep that true.
import type { FulfillmentBaseRow } from "#db/fulfillments/repo.ts";
import type { MethodRow } from "#db/fulfillments/methods/repo.ts";
import type { PickupRow } from "#db/fulfillments/pickups/repo.ts";
import type { DirectRow } from "#db/fulfillments/directs/repo.ts";
import type { ShipmentLinkRow } from "#db/fulfillments/shipments/repo.ts";

// The method as it is nested. A method exists independently of any fulfillment -
// the same row is referenced by every order that chose it - so it is its own
// object, by the same test that keeps organizations out of carriers.
type NestedMethod = Pick<
  MethodRow, "id" | "type" | "label" | "admin_label" | "category" | "direction"
>;

// The children are VERBATIM rows: pickups/directs/shipments whole, each this fulfillment's own child. The method is the opposite kind of thing - shared reference data the frontend caches separately, so the wire carries method_id, never the object (Jacob: "we should have a method_id, not the method itself"). It stays nested HERE because the service's own logic branches on method.category; toWire() strips it at the edge.
export type ComposedFulfillment = FulfillmentBaseRow & {
  method: NestedMethod;
  pickup: PickupRow | null;
  direct: DirectRow | null;
  shipment: ShipmentLinkRow | null;
};

// The wire shape: the bare fulfillments.fulfillments row, verbatim, nothing else. Method and the child rows are internal; their wire homes are the parent-path reads (/orders/:orderId/shipments etc.).
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

// The first row wins, not the last - for shipments that's a real choice: a fulfillment may have several parcels (unlike pickups/directs, one per fulfillment). Nesting the first keeps one row per fulfillment, which every caller expects; returning the list would be a wire change, and the right answer one day.
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

// Moved here from SQL since it sorts on a column of two different joined tables. NULLS LAST kept deliberately: an unscheduled pickup is work to be BOOKED, not happening now, and JS's default comparison would put it first.
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
