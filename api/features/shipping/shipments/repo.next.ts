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
// exchange is exported FLAT from the contracts index, not namespaced - it is
// still what serves traffic, and every per-feature schema is namespaced
// because their table names collide with it by design. Aliased so the next
// reader can see WHICH schema this row describes.
import type { ShipmentsRow as ExchangeShipmentsRow } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// The row type is exchange.shipments' OWN shape, not shipping.shipments'.
// repo.exchange.js reads SELECT *, so the wire shape is every column that
// table has - including purchase_order_id and sales_order_id, which the new
// schema does not keep and the projection below reconstructs. Typing this
// against shipping.ShipmentsRow would describe the table rather than the
// contract, and the contract is the thing that must not change.
export type ShipmentRow = ExchangeShipmentsRow;

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

// `rows ?? null` in both implementations. pg never hands back a null `rows`,
// so the fallback is dead and the real return is an array - which is what the
// compiler agrees to. Left the expression alone: changing it would change
// repo.exchange.js's sibling too, and it costs nothing where it is.
export async function getAll(client?: Executor): Promise<ShipmentRow[]> {
  const { rows } = await query<ShipmentRow>(
    `SELECT ${SHIPMENT_COLUMNS} ${SHIPMENT_FROM} ORDER BY s.id ASC`,
    [],
    client
  );
  return rows ?? null;
}

export async function getById(id: string, client?: Executor): Promise<ShipmentRow | null> {
  const { rows } = await query<ShipmentRow>(
    `SELECT ${SHIPMENT_COLUMNS} ${SHIPMENT_FROM} WHERE s.id = $1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

// Matches either order id, as exchange does with its OR across two columns.
// Here both come from the same place, so one comparison covers both.
// Returns ONE shipment, not a list, matching repo.exchange.js - an order can
// legitimately have more than one, and both implementations take the first.
export async function getByOrder(id: string, client?: Executor): Promise<ShipmentRow | null> {
  const { rows } = await query<ShipmentRow>(
    `SELECT ${SHIPMENT_COLUMNS} ${SHIPMENT_FROM} WHERE f.order_id = $1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- mirroring
//
// The dual-write phase re-derives a shipment from exchange after it has been
// written there, rather than applying the same change twice. Same reasoning as
// the orders mirrors: one definition of what a shipment looks like in the new
// schema, exercised by every write instead of only at migration time.
//
// A shipment is three rows here. The shipment itself, the fulfillment that says
// which order it belongs to, and the link between them that records which of
// our locations handled it. Creating a shipment in exchange therefore has to
// create or find all three, which is what 052 does at migration time and this
// repeats per write.
//
// Everything is server-side, and every function takes the caller's executor so
// the mirror joins the same transaction as the write it follows.

export async function mirrorShipment(id: string, executor?: Executor): Promise<void> {
  await query(
    `INSERT INTO shipping.shipments (
       id, carrier_service_id, package_id, tracking_number,
       shipper_address_id, recipient_address_id,
       delivered_at, shipped_at, est_delivery, label_type, label,
       direction, insured, declared_value, cost,
       shipping_status, pickup_type, created_at
     )
     SELECT
       e.id,
       (SELECT s.id FROM shipping.services s
         WHERE s.carrier_id = e.carrier_id AND s.name = e.service_type),
       (SELECT p.id FROM shipping.packages p
         WHERE p.carrier_id = e.carrier_id AND p.label = e.package),
       e.tracking_number,
       CASE WHEN e.type = 'Inbound'  THEN addr.id END,
       CASE WHEN e.type = 'Outbound' THEN addr.id END,
       e.delivered_at, e.shipped_at, e.estimated_delivery,
       e.label_type, e.shipping_label,
       e.type::text::shipping.direction,
       coalesce(e.insured, false), e.declared_value, e.net_charge,
       e.shipping_status, e.pickup_type, e.created_at
     FROM exchange.shipments e
     LEFT JOIN LATERAL (
       SELECT a.id FROM exchange.addresses a
       WHERE a.id = coalesce(
         (SELECT p.address_id FROM exchange.purchase_orders p WHERE p.id = e.purchase_order_id),
         (SELECT so.address_id FROM exchange.sales_orders so WHERE so.id = e.sales_order_id))
         AND EXISTS (SELECT 1 FROM places.addresses pa WHERE pa.id = a.id)
     ) AS addr ON true
     WHERE e.id = $1
     ON CONFLICT (id) DO UPDATE SET
       carrier_service_id = EXCLUDED.carrier_service_id,
       package_id = EXCLUDED.package_id,
       tracking_number = EXCLUDED.tracking_number,
       shipper_address_id = coalesce(EXCLUDED.shipper_address_id, shipping.shipments.shipper_address_id),
       recipient_address_id = coalesce(EXCLUDED.recipient_address_id, shipping.shipments.recipient_address_id),
       delivered_at = EXCLUDED.delivered_at, shipped_at = EXCLUDED.shipped_at,
       est_delivery = EXCLUDED.est_delivery, label_type = EXCLUDED.label_type,
       label = EXCLUDED.label, direction = EXCLUDED.direction,
       insured = EXCLUDED.insured, declared_value = EXCLUDED.declared_value,
       cost = EXCLUDED.cost, shipping_status = EXCLUDED.shipping_status,
       pickup_type = EXCLUDED.pickup_type, created_at = EXCLUDED.created_at`,
    [id],
    executor
  );

  // The fulfillment, which is what carries the order link. One per order, so
  // a second shipment on the same order finds the existing one rather than
  // making another.
  await query(
    `INSERT INTO fulfillments.fulfillments (order_id, method_id, status, created_at, updated_at)
     SELECT
       coalesce(e.purchase_order_id, e.sales_order_id),
       m.id,
       CASE WHEN e.shipping_status = 'Delivered' THEN 'COMPLETED' ELSE 'PENDING' END,
       e.created_at, e.created_at
     FROM exchange.shipments e
     JOIN fulfillments.methods m
       ON m.type = CASE e.pickup_type
                     WHEN 'Store Dropoff' THEN 'CARRIER DROPOFF'
                     WHEN 'DropShip'      THEN 'DROPSHIP'
                   END
      AND m.direction = (CASE WHEN e.purchase_order_id IS NOT NULL
                              THEN 'purchase' ELSE 'sale' END)::orders.direction
     WHERE e.id = $1
       AND coalesce(e.purchase_order_id, e.sales_order_id) IS NOT NULL
       AND EXISTS (SELECT 1 FROM orders.orders o
                    WHERE o.id = coalesce(e.purchase_order_id, e.sales_order_id))
     ON CONFLICT (order_id) DO UPDATE SET
       status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
    [id],
    executor
  );

  await query(
    `INSERT INTO fulfillments.shipments (
       fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
     )
     SELECT
       f.id, e.id,
       CASE WHEN e.type = 'Inbound'
            THEN (SELECT l.id FROM places.locations l WHERE l.type = 'FEDEX_OFFICE' LIMIT 1) END,
       CASE WHEN e.type = 'Outbound'
            THEN (SELECT l.id FROM places.locations l WHERE l.type = 'REFINER_OFFICE' LIMIT 1) END
     FROM exchange.shipments e
     JOIN fulfillments.fulfillments f
       ON f.order_id = coalesce(e.purchase_order_id, e.sales_order_id)
     WHERE e.id = $1
     ON CONFLICT (shipment_id) DO UPDATE SET
       fulfillment_id = EXCLUDED.fulfillment_id,
       recipient_location_id = coalesce(EXCLUDED.recipient_location_id, fulfillments.shipments.recipient_location_id),
       shipper_location_id = coalesce(EXCLUDED.shipper_location_id, fulfillments.shipments.shipper_location_id)`,
    [id],
    executor
  );
}

// Removes what exchange no longer has. The links go first, then the shipment:
// fulfillments.shipments references it, and the fulfillment itself is left
// alone because an order can be fulfilled without a surviving shipment record.
export async function removeShipment(id: string, executor?: Executor): Promise<void> {
  await query(
    `DELETE FROM fulfillments.shipments fs
     WHERE fs.shipment_id = $1
       AND NOT EXISTS (SELECT 1 FROM exchange.shipments e WHERE e.id = fs.shipment_id)`,
    [id],
    executor
  );
  await query(
    `DELETE FROM shipping.shipments s
     WHERE s.id = $1
       AND NOT EXISTS (SELECT 1 FROM exchange.shipments e WHERE e.id = s.id)`,
    [id],
    executor
  );
}
