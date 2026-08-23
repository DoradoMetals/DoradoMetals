// Carrier services read from shipping.services.
//
// Three columns were renamed in the new layout and are aliased back, because
// the wire shape must not change during a schema migration: the admin table
// and drawer in frontend/features/carriers read supports_pickup,
// supports_dropoff and max_weight_lbs.
//
//   supports_pickups  -> supports_pickup
//   supports_dropoffs -> supports_dropoff
//   max_weight_lb     -> max_weight_lbs
//
// created_by_id and updated_by_id are new here and are deliberately not
// returned - exchange.carrier_services has no such columns, and adding them to
// the response would be a wire change.
//
// The ids differ from exchange's and that is expected; see
// migrations/053_shipping_services_unique_name.sql. (carrier_id, name) is the
// identity, and carrier_id itself is stable - shipping.carriers reuses
// exchange.carriers' ids exactly, verified for all three carriers.
import query from "#shared/db/query.js";

const FIELDS = `
    s.id,
    s.carrier_id,
    s.name,
    s.description,
    s.code,
    s.provider_code,
    s.supports_pickups  AS supports_pickup,
    s.supports_dropoffs AS supports_dropoff,
    s.supports_returns,
    s.max_weight_lb     AS max_weight_lbs,
    s.max_length_in,
    s.max_width_in,
    s.max_height_in,
    s.supports_insurance,
    s.max_declared_value,
    s.is_international,
    s.is_residential,
    s.is_active,
    s.display_order,
    s.created_by,
    s.updated_by,
    s.created_at,
    s.updated_at,
    s.min_transit_days,
    s.max_transit_days
`;

// exchange orders by name alone. Ties are possible - 'Free', 'Overnight' and
// 'Standard' each exist for both FedEx and UPS - so id breaks them, or the two
// implementations would return the same rows in a different order and `diff`
// would report a divergence that is not one.
export async function getAll(client) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM shipping.services s ORDER BY s.name ASC, s.id ASC`,
    [],
    client
  );
  return rows ?? [];
}

export async function getById(id, client) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM shipping.services s WHERE s.id = $1 LIMIT 1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

export async function getByCarrierId(carrier_id, client) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM shipping.services s
     WHERE s.carrier_id = $1 ORDER BY s.name ASC, s.id ASC`,
    [carrier_id],
    client
  );
  return rows ?? [];
}

// Copies one service across from exchange, server-side, matched on
// (carrier_id, name) rather than on id.
//
// It cannot be matched on id. exchange's id may already belong to a different
// service here - in dev, exchange's FedEx 'Overnight' carries the id that
// shipping.services gives FedEx 'Priority Overnight' - so an INSERT carrying
// exchange's id would violate the primary key and take the caller's
// transaction down with it. New rows therefore get a fresh id, and existing
// ones keep the id they have; nothing references either.
export async function mirrorService(id, client) {
  await query(
    `INSERT INTO shipping.services (
       id, carrier_id, name, description, code, provider_code,
       supports_pickups, supports_dropoffs, supports_returns, supports_insurance,
       is_international, is_residential, is_active,
       max_weight_lb, max_length_in, max_width_in, max_height_in,
       max_declared_value, min_transit_days, max_transit_days, display_order,
       created_at, updated_at, created_by, updated_by
     )
     SELECT
       COALESCE(s.id, gen_random_uuid()),
       e.carrier_id, e.name, e.description, e.code, e.provider_code,
       e.supports_pickup, e.supports_dropoff, e.supports_returns, e.supports_insurance,
       e.is_international, e.is_residential, e.is_active,
       e.max_weight_lbs, e.max_length_in, e.max_width_in, e.max_height_in,
       e.max_declared_value, e.min_transit_days, e.max_transit_days, e.display_order,
       e.created_at, e.updated_at, e.created_by, e.updated_by
     FROM exchange.carrier_services e
     LEFT JOIN shipping.services s
       ON s.carrier_id = e.carrier_id AND s.name = e.name
     WHERE e.id = $1
     ON CONFLICT (carrier_id, name) DO UPDATE SET
       description        = EXCLUDED.description,
       code               = EXCLUDED.code,
       provider_code      = EXCLUDED.provider_code,
       supports_pickups   = EXCLUDED.supports_pickups,
       supports_dropoffs  = EXCLUDED.supports_dropoffs,
       supports_returns   = EXCLUDED.supports_returns,
       supports_insurance = EXCLUDED.supports_insurance,
       is_international   = EXCLUDED.is_international,
       is_residential     = EXCLUDED.is_residential,
       is_active          = EXCLUDED.is_active,
       max_weight_lb      = EXCLUDED.max_weight_lb,
       max_length_in      = EXCLUDED.max_length_in,
       max_width_in       = EXCLUDED.max_width_in,
       max_height_in      = EXCLUDED.max_height_in,
       max_declared_value = EXCLUDED.max_declared_value,
       min_transit_days   = EXCLUDED.min_transit_days,
       max_transit_days   = EXCLUDED.max_transit_days,
       display_order      = EXCLUDED.display_order,
       created_at         = EXCLUDED.created_at,
       updated_at         = EXCLUDED.updated_at,
       created_by         = EXCLUDED.created_by,
       updated_by         = EXCLUDED.updated_by`,
    [id],
    client
  );

  const { rows } = await query(
    `SELECT ${FIELDS} FROM shipping.services s
     JOIN exchange.carrier_services e
       ON e.carrier_id = s.carrier_id AND e.name = s.name
     WHERE e.id = $1 LIMIT 1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

// Removes the row matching the exchange service's (carrier_id, name).
//
// Takes the pair rather than an id because the caller holds an exchange id,
// which means nothing here. shipping.shipments.carrier_service_id references
// this table with no ON DELETE clause, so deleting a service that shipments
// still point at is refused - see the note in repo.dual.js.
export async function removeByPair(carrier_id, name, client) {
  await query(
    `DELETE FROM shipping.services WHERE carrier_id = $1 AND name = $2`,
    [carrier_id, name],
    client
  );
  return true;
}

// Moves the row that (carrier_id, name) currently points at onto a new pair.
//
// Needed because update() can change the name, and the mirror is keyed on the
// name. Without this, renaming FedEx 'Overnight' to 'Next Day' would leave the
// old row untouched and insert a second one, and the table would hold both.
export async function renamePair(from, to, client) {
  if (from.carrier_id === to.carrier_id && from.name === to.name) return false;
  const { rowCount } = await query(
    `UPDATE shipping.services SET carrier_id = $3, name = $4
     WHERE carrier_id = $1 AND name = $2`,
    [from.carrier_id, from.name, to.carrier_id, to.name],
    client
  );
  return rowCount > 0;
}
