// A fulfillment, its method, its children and the decisions that follow -
// assembled in memory into the FulfillmentView the wire carries.
//
// The method join is effectively INNER (a fulfillment whose method is gone is
// dropped, because every rule below reads its category) and the three details
// OUTER (a null slot is normal for a new order). Only one detail is ever
// present, since a fulfillment has one method and a method has one category;
// setMethod deletes the detail that no longer applies to keep that true.
//
// `missing` IS ASSEMBLED HERE AND NOWHERE ELSE (ruling 70). It is what the
// handover still owes, read off whichever detail row the category names, and
// domain/checkout appends it to its own four-entry list without knowing one of
// the column names in it.
import * as rules from "#domain/fulfillments/rules.ts";
import type {
  CarrierHandoff, Fulfillment, FulfillmentDirect, FulfillmentMethodRead, FulfillmentParcel,
  FulfillmentPickup, FulfillmentShipment, FulfillmentView,
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
// fulfillment_id - one read per table rather than a query per row. Written out
// twice rather than named: it is a bag of several entities' Maps, not a
// derivation of any one of them, so it has no home in @dorado/contracts
// (rulings 57/60/61) and `lint:type-homes` is right to refuse a local alias.
export function compose(f: Fulfillment, d: {
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
  parcels: Map<string, FulfillmentParcel>;
  labelled: Set<string>;
  handoffs: CarrierHandoff[];
}): FulfillmentView | null {
  const method = d.methods.get(f.method_id);
  // The method join is INNER. A fulfillment whose method is gone is dropped
  // rather than returned with a null where every rule reads a category.
  if (!method) return null;

  const pickup = d.pickups.get(f.id) ?? null;
  const direct = d.directs.get(f.id) ?? null;
  const shipments = d.shipmentLinks.get(f.id) ?? [];
  // The FIRST parcel is the handover's: a second one is a return leg, bought
  // by a cancellation, and the customer chose nothing about it.
  const parcel = d.parcels.get(shipments[0]?.shipment_id ?? "") ?? null;
  const scheduled_at = rules.scheduledAt(pickup, direct);

  return {
    fulfillment: f,
    method,
    pickup,
    direct,
    shipments,
    parcel,
    requires_schedule: rules.requiresSchedule(method.category),
    is_scheduled: scheduled_at !== null,
    scheduled_at,
    missing: rules.missingFor({
      category: method.category,
      parcel,
      pickup,
      direct,
      needsCourierSlot: rules.requiresCourierSlot(method, d.handoffs),
    }),
    actions: rules.actionsFor(method, {
      // A BOUGHT LABEL is what locks the category, not a link: every SHIPMENT
      // draft carries a shell from the moment the method is picked, so
      // `shipments.length > 0` would refuse the customer's very next change of
      // mind.
      hasShipment: shipments.some((link) => d.labelled.has(link.shipment_id)),
      isScheduled: scheduled_at !== null,
    }),
  };
}

export function composeAll(rows: Fulfillment[], d: {
  methods: Map<string, FulfillmentMethodRead>;
  pickups: Map<string, FulfillmentPickup>;
  directs: Map<string, FulfillmentDirect>;
  shipmentLinks: Map<string, FulfillmentShipment[]>;
  parcels: Map<string, FulfillmentParcel>;
  labelled: Set<string>;
  handoffs: CarrierHandoff[];
}): FulfillmentView[] {
  return rows.flatMap((f) => {
    const composed = compose(f, d);
    return composed ? [composed] : [];
  });
}
