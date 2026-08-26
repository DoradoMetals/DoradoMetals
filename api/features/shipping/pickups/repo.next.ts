// Carrier pickups read from shipping.pickups.
//
// This is a relocation, not a copy - the same pattern shipments turned out to
// follow. exchange.carrier_pickups hangs a pickup off an *order* and names its
// carrier in a text column; shipping.pickups hangs it off a *shipment* and lets
// the shipment's service say who the carrier is:
//
//   exchange.carrier_pickups          shipping.pickups
//   ------------------------          ----------------
//   order_id                          shipment_id -> fulfillments -> order
//   user_id                           (via the order)
//   carrier            (text)         (via the shipment's service's carrier)
//   pickup_requested_at               requested_at
//   pickup_status                     status
//   confirmation_number (numeric)     confirmation_number (text)
//   location                          location
//
// It is emphatically NOT fulfillments.pickups. That table is fulfillment_id,
// pickup_address_id, assigned_employee_id, start_time, end_time - a customer
// collecting in person, matching the PICKUP and APPOINTMENT fulfillment
// methods. A carrier collecting a parcel is a different thing that happens to
// share a word.
//
// Both tables are empty in dev and in production, so none of this could be
// checked against rows the way shipments was. What it rests on instead is the
// column semantics above and the fact that the abandoned January repo already
// wrote `shipment_id` - whoever started this had shipping.pickups in mind.
//
// confirmation_number is cast back to numeric to hold the wire shape. That is
// safe rather than lossy: every row here arrives through mirrorPickup, which
// reads exchange's numeric column, so nothing non-numeric can be in it.
import query from "#shared/db/query.js";
import type { shipping } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// shipping.pickups. A carrier pickup is a shipment in the new design rather
// than a fulfillments.pickups row - the two are different things and the
// backfill keeps them apart.
export type PickupRow = shipping.PickupsRow;


const FIELDS = `
    p.id,
    o.user_id,
    f.order_id,
    org.name AS carrier,
    p.requested_at AS pickup_requested_at,
    p.status AS pickup_status,
    p.confirmation_number::numeric AS confirmation_number,
    p.location
`;

const FROM = `
    FROM shipping.pickups p
    LEFT JOIN fulfillments.shipments fs ON fs.shipment_id = p.shipment_id
    LEFT JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
    LEFT JOIN orders.orders o ON o.id = f.order_id
    LEFT JOIN shipping.shipments s ON s.id = p.shipment_id
    LEFT JOIN shipping.services sv ON sv.id = s.carrier_service_id
    LEFT JOIN shipping.carriers ca ON ca.id = sv.carrier_id
    LEFT JOIN organizations.organizations org ON org.id = ca.organization_id
`;

// id breaks the tie on requested_at, because exchange's ORDER BY is not unique
// and two implementations returning the same rows in a different order would
// show up in `diff` as a divergence that is not one.
export async function getAll(client?: Executor): Promise<PickupRow[]> {
  const { rows } = await query<PickupRow>(
    `SELECT ${FIELDS} ${FROM} ORDER BY p.requested_at DESC, p.id ASC`,
    [],
    client
  );
  return rows ?? [];
}

export async function getById(id: string, client?: Executor): Promise<PickupRow | undefined> {
  const { rows } = await query<PickupRow>(
    `SELECT ${FIELDS} ${FROM} WHERE p.id = $1 LIMIT 1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

// Returns a LIST. An order can carry more than one pickup - a first attempt and
// a rebooking - and the caller filters. Typed as one row at first, which the
// compiler rejected against `return rows ?? []`.
export async function getByOrder(
  order_id: string,
  client?: Executor
): Promise<PickupRow[]> {
  const { rows } = await query<PickupRow>(
    `SELECT ${FIELDS} ${FROM} WHERE f.order_id = $1 ORDER BY p.requested_at DESC, p.id ASC`,
    [order_id],
    client
  );
  return rows ?? [];
}

// Copies a pickup across from exchange, server-side, id included.
//
// The id can be carried here - unlike services - because shipping.pickups is
// empty everywhere and only this mirror ever writes it, so exchange's id cannot
// already belong to something else.
//
// shipment_id is NOT NULL and exchange records only an order, so the shipment
// has to be resolved: exchange.shipments is matched on whichever of
// purchase_order_id or sales_order_id equals the pickup's order, and the row
// must already exist in shipping.shipments. When it does not resolve, nothing
// is written and the function says so, rather than inventing a shipment or
// failing the caller's transaction over a mirror.
// Returns whether it mirrored anything, not the row. Same shape as the
// exchange implementation, which repo.dual switches against.
export async function mirrorPickup(id: string, client?: Executor): Promise<boolean> {
  const { rowCount } = await query<PickupRow>(
    `INSERT INTO shipping.pickups (id, shipment_id, requested_at, status, confirmation_number, location)
     SELECT e.id, ss.id, e.pickup_requested_at, e.pickup_status,
            e.confirmation_number::text, e.location
     FROM exchange.carrier_pickups e
     JOIN exchange.shipments es
       ON es.purchase_order_id = e.order_id OR es.sales_order_id = e.order_id
     JOIN shipping.shipments ss ON ss.id = es.id
     WHERE e.id = $1
     ON CONFLICT (id) DO UPDATE SET
       shipment_id         = EXCLUDED.shipment_id,
       requested_at        = EXCLUDED.requested_at,
       status              = EXCLUDED.status,
       confirmation_number = EXCLUDED.confirmation_number,
       location            = EXCLUDED.location`,
    [id],
    client
  );
  // pg types rowCount as number | null. The JavaScript relied on null > 0
  // being false, which it is - made explicit rather than left to coercion.
  return (rowCount ?? 0) > 0;
}

export async function remove(id: string, client?: Executor): Promise<boolean> {
  await query<PickupRow>(`DELETE FROM shipping.pickups WHERE id = $1`, [id], client);
  return true;
}
