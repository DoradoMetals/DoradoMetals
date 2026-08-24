// Fulfillment methods - the ways an order can change hands.
//
// This is the first repo in the migration with no repo.exchange beside it, and
// that is not an omission. exchange never recorded how an order was fulfilled
// beyond shipments.pickup_type, a text column holding two values. The eleven
// rows here come from 047_seed_reference_data.sql, which supplies what exchange
// never held, so there is no source to read from and nothing to switch between.
// A *_SOURCE switch would have exactly one state.
//
// Three categories, and they are code rather than data. Each names which table
// carries the detail:
//
//   SHIPMENT  -> fulfillments.shipments  (a parcel, handled by features/shipping)
//   PICKUP    -> fulfillments.pickups    (we collect from the customer)
//   DIRECT    -> fulfillments.directs    (the customer comes to a location)
//
// That is why create and remove are not offered here and update is. An admin
// turning Pickup off for a week is reference data changing. An admin inventing
// a method of category 'COURIER' is a fulfillment nothing can complete, because
// no table holds a courier's details and no code reads one - it would be a row
// that looks like a feature and is not.
//
// label vs admin_label is a real distinction and both are kept: 'Pickup' means
// two different things to a customer depending on the category, and the admin
// side needs to tell 'Dorado Pickup' from 'Carrier Pickup'.
import query from "#shared/db/query.js";

const FIELDS = `
    m.id,
    m.type,
    m.label,
    m.admin_label,
    m.category,
    m.direction,
    m.enabled,
    m.hidden,
    m.is_default,
    m.created_at,
    m.updated_at
`;

// What a customer may choose. hidden is the column that says "this exists and
// is not on the menu" - OWN LABEL and WALK IN are both enabled and hidden,
// because an admin can put an order on them and a customer cannot ask for one.
//
// direction is required rather than defaulted. The same type exists once per
// direction and they are different rows; answering with both would let a sell
// flow offer DROPSHIP, which is a sale's method.
export async function getAvailable(direction, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS}
       FROM fulfillments.methods m
      WHERE m.direction = $1::orders.direction
        AND m.enabled
        AND NOT m.hidden
      ORDER BY m.is_default DESC, m.category ASC, m.label ASC, m.id ASC`,
    [direction],
    executor
  );
  return rows ?? [];
}

// Everything, hidden and disabled included, for the admin side. id breaks the
// tie so two callers reading the same rows get them in the same order.
export async function getAll(executor) {
  const { rows } = await query(
    `SELECT ${FIELDS}
       FROM fulfillments.methods m
      ORDER BY m.direction ASC, m.category ASC, m.label ASC, m.id ASC`,
    [],
    executor
  );
  return rows ?? [];
}

export async function getById(id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM fulfillments.methods m WHERE m.id = $1 LIMIT 1`,
    [id],
    executor
  );
  return rows[0] ?? null;
}

// The method a direction falls back to when nothing was chosen. Every direction
// has exactly one default per category in the seed; this asks for the default of
// a named category, because "the default method for a sale" is ambiguous and
// "the default way to ship a sale" is not.
export async function getDefault({ direction, category }, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS}
       FROM fulfillments.methods m
      WHERE m.direction = $1::orders.direction
        AND m.category = $2
        AND m.is_default
        AND m.enabled
      ORDER BY m.id ASC
      LIMIT 1`,
    [direction, category],
    executor
  );
  return rows[0] ?? null;
}

// Availability and wording only. type, category and direction are what the code
// dispatches on and are deliberately not updatable - changing a method's
// category would move existing fulfillments to a detail table their rows are
// not in.
//
// COALESCE rather than a built statement so a partial update leaves the rest
// alone, which is what every admin toggle sends.
export async function update(method, executor) {
  const { rows } = await query(
    `UPDATE fulfillments.methods m SET
       label       = coalesce($2, m.label),
       admin_label = coalesce($3, m.admin_label),
       enabled     = coalesce($4, m.enabled),
       hidden      = coalesce($5, m.hidden),
       updated_at  = now(),
       updated_by_id = coalesce($6, m.updated_by_id)
     WHERE m.id = $1
     RETURNING ${FIELDS}`,
    [
      method?.id,
      method?.label ?? null,
      method?.admin_label ?? null,
      method?.enabled ?? null,
      method?.hidden ?? null,
      method?.updated_by_id ?? null,
    ],
    executor
  );
  return rows[0] ?? null;
}
