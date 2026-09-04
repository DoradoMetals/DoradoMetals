// A fulfillment, its method, its children and the decisions that follow -
// assembled in memory into the FulfillmentView the wire carries.
//
// The method join is effectively INNER (a fulfillment whose method is gone is
// dropped, because every rule below reads its category) and the three details
// OUTER (a null slot is normal for a new order). Only one detail is ever
// present, since a fulfillment has one method and a method has one category;
// setMethod deletes the detail that no longer applies to keep that true.
import * as rules from "#domain/fulfillments/rules.ts";
import type {
  Fulfillment, FulfillmentDirect, FulfillmentMethodRead, FulfillmentPickup,
  FulfillmentShipment, FulfillmentView,
} from "@dorado/contracts";

// The first row wins for the one-per-fulfillment children (the table enforces
// it); shipments are grouped instead, because a fulfillment may legitimately
// hold several parcels and the view carries them all.
export const byFulfillment = <T extends { fulfillment_id: string }>(rows: T[]): Map<string, T> => {
  const out = new Map<string, T>();
  for (const r of rows) if (!out.has(r.fulfillment_id)) out.set(r.fulfillment_id, r);
  return out;
};

export const groupByFulfillment = <T extends { fulfillment_id: string }>(
  rows: T[]
): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.fulfillment_id);
    if (list) list.push(r);
    else out.set(r.fulfillment_id, [r]);
  }
  return out;
};

// `method` is passed through, never re-spelled: it IS FulfillmentMethodRead -
// the same reference row GET /fulfillments/methods serves - so a client holds
// one method type and not two.

// `d` is everything the details of a set of fulfillments need, keyed by
// fulfillment_id - one read per table rather than a query per row. Not a named
// type: it is a bag of four different entities' Maps, not a derivation of any
// one of them, and its only two consumers are this file and service.ts.
export function compose(f: Fulfillment, d: {
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
}): FulfillmentView | null {
  const method = d.methods.get(f.method_id);
  // The method join is INNER. A fulfillment whose method is gone is dropped
  // rather than returned with a null where every rule reads a category.
  if (!method) return null;

  const pickup = d.pickups.get(f.id) ?? null;
  const direct = d.directs.get(f.id) ?? null;
  const shipments = d.shipmentLinks.get(f.id) ?? [];
  const scheduled_at = rules.scheduledAt(pickup, direct);

  return {
    fulfillment: f,
    method,
    pickup,
    direct,
    shipments,
    requires_schedule: rules.requiresSchedule(method.category),
    is_scheduled: scheduled_at !== null,
    scheduled_at,
    actions: rules.actionsFor(method, {
      hasShipment: shipments.length > 0,
      isScheduled: scheduled_at !== null,
    }),
  };
}

export function composeAll(rows: Fulfillment[], d: {
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
}): FulfillmentView[] {
  return rows.flatMap((f) => {
    const composed = compose(f, d);
    return composed ? [composed] : [];
  });
}
