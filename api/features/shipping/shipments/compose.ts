// A shipment, put back into the shape exchange.shipments has.
//
// This is the largest reconstruction in the migration, and it is worth being
// precise about what is being reconstructed and why.
//
// exchange.shipments is one flat row of nineteen columns, and the reads against
// it are `SELECT *` - so the wire shape is every column that table has. Three
// kinds of thing moved:
//
//   THE ORDER LINK. purchase_order_id and sales_order_id are gone, because an
//   order's FULFILLMENT is what knows about the order. Put back through three
//   hops: fulfillments.shipments -> fulfillments.fulfillments -> orders.orders,
//   with the direction deciding WHICH of the two columns the id lands in.
//
//   THE SERVICE AND PACKAGE. `service_type` and `package` are text on the
//   shipment in exchange and references here, so they are resolved back to
//   their names. `carrier_id` comes through the service rather than being
//   stored twice.
//
//   THE RENAMES. est_delivery -> estimated_delivery, label -> shipping_label,
//   cost -> net_charge, direction -> type.
//
// EVERY JOIN IT REPLACED WAS A LEFT JOIN, and that matters more here than
// anywhere else: a shipment with no fulfillment yet still has to come back,
// with null order ids, exactly as one with no order does in exchange. Dropping
// it would hide a parcel that exists. Nothing is filtered out here for any
// reason.
import type { ShipmentBaseRow } from "#features/shipping/shipments/repo.ts";
import type { ServiceRow } from "#features/shipping/services/repo.ts";

// The nineteen columns of exchange.shipments, which is what every caller reads.
export type ComposedShipment = {
  id: string;
  purchase_order_id: string | null;
  tracking_number: string | null;
  shipping_status: string | null;
  estimated_delivery: Date | string | null;
  shipped_at: Date | string | null;
  delivered_at: Date | string | null;
  created_at: Date | string | null;
  shipping_label: string | null;
  label_type: string | null;
  pickup_type: string | null;
  package: string | null;
  service_type: string | null;
  net_charge: number | null;
  insured: boolean | null;
  declared_value: number | null;
  type: string | null;
  sales_order_id: string | null;
  carrier_id: string | null;
};

// Where a shipment's order was found, and which direction it is. Both are
// nullable: a shipment with no fulfillment has neither.
export type OrderLink = { order_id: string | null; direction: string | null };

export type Lookups = {
  services: Map<string, Pick<ServiceRow, "name" | "carrier_id">>;
  packageLabels: Map<string, string>;
  // shipment_id -> where its order is. Absent means no fulfillment.
  orderLinks: Map<string, OrderLink>;
};

export function compose(s: ShipmentBaseRow, l: Lookups): ComposedShipment {
  const service = s.carrier_service_id === null
    ? undefined
    : l.services.get(s.carrier_service_id);
  const pkg = s.package_id === null ? undefined : l.packageLabels.get(s.package_id);
  const link = l.orderLinks.get(s.id);

  // The direction decides which column the order id lands in. A purchase fills
  // purchase_order_id, a sale fills sales_order_id, and NEITHER is filled when
  // there is no fulfillment - which is a shipment exchange would show with two
  // nulls, not a shipment to hide.
  const isPurchase = link?.direction === "purchase";
  const isSale = link?.direction === "sale";

  return {
    id: s.id,
    purchase_order_id: isPurchase ? (link?.order_id ?? null) : null,
    tracking_number: s.tracking_number,
    shipping_status: s.shipping_status,
    estimated_delivery: s.est_delivery,
    shipped_at: s.shipped_at,
    delivered_at: s.delivered_at,
    created_at: s.created_at,
    shipping_label: s.label,
    label_type: s.label_type,
    pickup_type: s.pickup_type,
    package: pkg ?? null,
    service_type: service?.name ?? null,
    net_charge: s.cost,
    insured: s.insured,
    declared_value: s.declared_value,
    type: s.direction,
    sales_order_id: isSale ? (link?.order_id ?? null) : null,
    carrier_id: service?.carrier_id ?? null,
  };
}

export const composeAll = (
  rows: ShipmentBaseRow[], l: Lookups
): ComposedShipment[] => rows.map((s) => compose(s, l));
