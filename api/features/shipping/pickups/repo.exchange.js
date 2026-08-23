// Carrier pickups as they live in exchange.carrier_pickups.
//
// create and update did not work before this file was split out. They named a
// `shipment_id` column that exchange.carrier_pickups has never had - its
// columns are user_id, order_id, carrier, pickup_requested_at, pickup_status,
// confirmation_number and location - so every insert died on
//
//   42703  column "shipment_id" of relation "carrier_pickups" does not exist
//
// which is why the table holds no rows in dev or in production. The reads were
// fine, so nothing surfaced it: getByOrder filters on order_id, which exists.
//
// That mattered more than an empty table suggests. purchase-orders/service.js
// calls create() inside the same transaction that writes the shipping label,
// and only after shippingOps.createPickup has booked a real pickup with FedEx.
// The throw rolled the label write back while FedEx kept the booking, so
// choosing "Carrier Pickup" on a purchase order failed the submission and left
// a pickup scheduled that nothing recorded.
//
// The columns below are the ones the table actually has. The caller passes the
// pickup date and time separately, as FedEx wants them, and they are combined
// server-side rather than through a JS Date - a Date here would carry the
// process timezone into a `timestamp without time zone` column.
import query from "#shared/db/query.js";

export async function getAll(client) {
  const q = `
    SELECT *
    FROM exchange.carrier_pickups
    ORDER BY pickup_requested_at DESC, id ASC
  `;
  const { rows } = await query(q, [], client);
  return rows ?? [];
}

export async function getById(id, client) {
  const q = `
    SELECT *
    FROM exchange.carrier_pickups
    WHERE id = $1
    LIMIT 1
  `;
  const { rows } = await query(q, [id], client);
  return rows[0] ?? null;
}

export async function getByOrder(order_id, client) {
  const q = `
    SELECT *
    FROM exchange.carrier_pickups
    WHERE order_id = $1
    ORDER BY pickup_requested_at DESC, id ASC
  `;
  const { rows } = await query(q, [order_id], client);
  return rows ?? [];
}

// Accepts either a ready-made pickup_requested_at or the date/time pair the
// FedEx call is given. Combining happens in Postgres: `$1::date + $2::time`.
const REQUESTED_AT = `
  COALESCE(
    $4::timestamp,
    CASE WHEN $5::text IS NOT NULL
         THEN $5::date + COALESCE($6::time, '00:00'::time)
    END
  )`;

export async function create(pickup, client) {
  const q = `
    INSERT INTO exchange.carrier_pickups (
      user_id,
      order_id,
      carrier,
      pickup_requested_at,
      pickup_status,
      confirmation_number,
      location
    )
    VALUES ($1, $2, $3, ${REQUESTED_AT}, $7, $8, $9)
    RETURNING *;
  `;

  const vals = [
    pickup.user_id ?? null,
    pickup.order_id ?? null,
    pickup.carrier ?? null,
    pickup.pickup_requested_at ?? null,
    pickup.date ?? null,
    pickup.time ?? null,
    pickup.pickup_status ?? "Scheduled",
    pickup.confirmation_number ?? null,
    pickup.location ?? null,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function update(pickup, client) {
  const q = `
    UPDATE exchange.carrier_pickups
    SET
      user_id = $1,
      order_id = $2,
      carrier = $3,
      pickup_requested_at = ${REQUESTED_AT},
      pickup_status = $7,
      confirmation_number = $8,
      location = $9
    WHERE id = $10
    RETURNING *;
  `;

  const vals = [
    pickup.user_id ?? null,
    pickup.order_id ?? null,
    pickup.carrier ?? null,
    pickup.pickup_requested_at ?? null,
    pickup.date ?? null,
    pickup.time ?? null,
    pickup.pickup_status ?? null,
    pickup.confirmation_number ?? null,
    pickup.location ?? null,
    pickup.id,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function remove(id, client) {
  const q = `
    DELETE FROM exchange.carrier_pickups
    WHERE id = $1
  `;
  await query(q, [id], client);
  return true;
}
