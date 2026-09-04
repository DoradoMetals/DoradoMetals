import * as rules from "#domain/fulfillments/rules.ts";
import type {
  CarrierHandoff, Fulfillment, FulfillmentDirect, FulfillmentMethodRead, FulfillmentParcel,
  FulfillmentPickup, FulfillmentShipment, FulfillmentView,
} from "@dorado/contracts";

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
  if (!method) return null;

  const pickup = d.pickups.get(f.id) ?? null;
  const direct = d.directs.get(f.id) ?? null;
  const shipments = d.shipmentLinks.get(f.id) ?? [];
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
