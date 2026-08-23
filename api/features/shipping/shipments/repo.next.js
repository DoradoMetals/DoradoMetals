// Shipments read from the shipping schema.
//
// A shipment loses two things on the way across, and both have to be put back
// for the response to be unchanged.
//
// The order link. exchange.shipments carries purchase_order_id and
// sales_order_id; shipping.shipments carries neither, because an order's
// fulfillment is what knows about the order. It is reconstructed by joining
// back through fulfillments.shipments to fulfillments.fulfillments, and the
// direction on orders.orders decides which of the two columns it lands in - a
// purchase fills purchase_order_id, a sale fills sales_order_id. That is why
// fulfillments had to be backfilled before this file could exist: without it
// the join is empty and getByOrder cannot work at all.
//
// The service, package and carrier. Those are text on a shipment in exchange
// and references here, so they are resolved back to their names. carrier_id
// comes through the service rather than being stored twice.
import query from "#shared/db/query.js";

// Every column exchange.shipments has, in its own order, so that a caller
// reading the result cannot tell which schema answered.
export const SHIPMENT_COLUMNS = `
      s.id,
      CASE WHEN o.direction = 'purchase' THEN o.id END AS purchase_order_id,
      s.tracking_number,
      s.shipping_status,
      s.est_delivery AS estimated_delivery,
      s.shipped_at,
      s.delivered_at,
      s.created_at,
      s.label AS shipping_label,
      s.label_type,
      s.pickup_type,
      pk.label AS package,
      sv.name AS service_type,
      s.cost AS net_charge,
      s.insured,
      s.declared_value,
      s.direction::text AS type,
      CASE WHEN o.direction = 'sale' THEN o.id END AS sales_order_id,
      sv.carrier_id`;

// Left joins throughout: a shipment with no fulfillment yet still has to come
// back, with null order ids, exactly as one with no order does in exchange.
export const SHIPMENT_FROM = `
    FROM shipping.shipments s
    LEFT JOIN shipping.services sv ON sv.id = s.carrier_service_id
    LEFT JOIN shipping.packages pk ON pk.id = s.package_id
    LEFT JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
    LEFT JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
    LEFT JOIN orders.orders o ON o.id = f.order_id`;

export async function getAll(client) {
  const { rows } = await query(
    `SELECT ${SHIPMENT_COLUMNS} ${SHIPMENT_FROM} ORDER BY s.id ASC`,
    [],
    client
  );
  return rows ?? null;
}

export async function getById(id, client) {
  const { rows } = await query(
    `SELECT ${SHIPMENT_COLUMNS} ${SHIPMENT_FROM} WHERE s.id = $1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

// Matches either order id, as exchange does with its OR across two columns.
// Here both come from the same place, so one comparison covers both.
export async function getByOrder(id, client) {
  const { rows } = await query(
    `SELECT ${SHIPMENT_COLUMNS} ${SHIPMENT_FROM} WHERE f.order_id = $1`,
    [id],
    client
  );
  return rows[0] ?? null;
}
