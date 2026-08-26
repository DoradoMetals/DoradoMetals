// A fulfillment: how one order changes hands, and when.
//
// One row per order - fulfillments_order_uniq enforces it - naming a method,
// carrying a status, and having exactly one detail row in whichever table its
// method's category points at:
//
//   SHIPMENT  fulfillments.shipments   a parcel
//   PICKUP    fulfillments.pickups     we collect from the customer
//   DIRECT    fulfillments.directs     the customer comes to a location
//
// WHAT THIS FEATURE OWNS, and what it does not. The SHIPMENT half already
// exists: features/shipping mirrors exchange.shipments into shipping.shipments
// and writes the fulfillment and its link as it goes, because a shipment is
// something exchange records. PICKUP and DIRECT are the halves exchange never
// recorded - there is no pickup_type for "the customer walked in" - so there is
// nothing to mirror and nothing to switch between. Those two are new capability
// rather than migrated data, and this is where they live.
//
// That is also why there is no repo.exchange and no *_SOURCE switch. A switch
// with one state is a switch that lies about having somewhere else to go.
//
// THE ORDER MUST EXIST IN THE NEW SCHEMA. order_id references orders.orders,
// which is populated by backfill and kept current by the orders dual-write. So
// scheduling a pickup for an order that only exists in exchange fails on the
// foreign key, and it should: a fulfillment pointing at an order nobody can
// find is worse than a refusal. create() checks first and says so in words,
// rather than letting a constraint name reach the caller.
//
// Every write takes an executor and threads it, so the orders decomposition can
// create an order and its fulfillment in one transaction.
import query from "#shared/db/query.js";

// The method is nested rather than flattened. A method exists independently of
// any fulfillment - the same row is referenced by every order that chose it -
// so it is its own object, by the same test that keeps organizations out of
// carriers and refiners.
//
// The detail is nested under the name of its category, and only one is ever
// present, because a fulfillment has one method and a method has one category.
const FIELDS = `
    f.id,
    f.order_id,
    f.status,
    f.created_at,
    f.updated_at,
    f.created_by_id,
    f.updated_by_id,
    jsonb_build_object(
      'id',          m.id,
      'type',        m.type,
      'label',       m.label,
      'admin_label', m.admin_label,
      'category',    m.category,
      'direction',   m.direction
    ) AS method,
    CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',                   p.id,
      'pickup_address_id',    p.pickup_address_id,
      'assigned_employee_id', p.assigned_employee_id,
      'start_time',           p.start_time,
      'end_time',             p.end_time
    ) END AS pickup,
    CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',                   d.id,
      'location_id',          d.location_id,
      'assigned_employee_id', d.assigned_employee_id,
      'is_appointment',       d.is_appointment,
      'start_time',           d.start_time,
      'end_time',             d.end_time
    ) END AS direct,
    CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',                    s.id,
      'shipment_id',           s.shipment_id,
      'recipient_location_id', s.recipient_location_id,
      'shipper_location_id',   s.shipper_location_id
    ) END AS shipment
`;

const FROM = `
    FROM fulfillments.fulfillments f
    JOIN fulfillments.methods   m ON m.id = f.method_id
    LEFT JOIN fulfillments.pickups   p ON p.fulfillment_id = f.id
    LEFT JOIN fulfillments.directs   d ON d.fulfillment_id = f.id
    LEFT JOIN fulfillments.shipments s ON s.fulfillment_id = f.id
`;

// EVERY REFUSAL BELOW CARRIES A STATUS, AND THAT IS WHY THE MESSAGES ARE WORTH
// WRITING.
//
// shared/middleware/errorHandler.js shows a message to the caller only when the
// error carries a deliberate 4xx - "an error raised deliberately is different:
// it was written to be read, and its status says so". These six were bare
// `new Error`, so every one arrived as a generic 500 "Server error" and the
// explanation went to the log instead of to the admin who needed it.
//
// An admin trying to move an order off SHIPMENT was told "Server error" rather
// than "cancel the shipment first". Found by driving set_method over HTTP; the
// repo test for the same guard passes either way, because it asserts the
// thrown message rather than what the caller receives.
//
// 404 for "that does not exist", 409 for "the current state forbids this".
function refuse(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

export async function getByOrder(order_id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} WHERE f.order_id = $1 LIMIT 1`,
    [order_id],
    executor
  );
  return rows[0] ?? null;
}

export async function getById(id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} WHERE f.id = $1 LIMIT 1`,
    [id],
    executor
  );
  return rows[0] ?? null;
}

// Who the order belongs to, for the authorization the routes cannot do on
// their own. A fulfillment carries no user of its own - it belongs to an order
// and the order belongs to somebody - so asking "is this yours" means asking
// the order.
export async function ownerOf(order_id, executor) {
  const { rows } = await query(
    `SELECT user_id FROM orders.orders WHERE id = $1`,
    [order_id],
    executor
  );
  return rows[0]?.user_id ?? null;
}

// Everything an employee is expected to turn up for: the scheduled pickups and
// appointments, soonest first. Shipments are excluded because nobody is due
// anywhere for one - the whole point of the category split.
//
// A null start_time sorts last rather than first, which is what NULLS LAST
// buys: an unscheduled pickup is work to be booked, not work happening now.
export async function getScheduled({ from, to, employee_id } = {}, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM}
      WHERE m.category IN ('PICKUP', 'DIRECT')
        AND ($1::timestamptz IS NULL OR coalesce(p.start_time, d.start_time) >= $1)
        AND ($2::timestamptz IS NULL OR coalesce(p.start_time, d.start_time) <  $2)
        AND ($3::uuid IS NULL
             OR coalesce(p.assigned_employee_id, d.assigned_employee_id) = $3)
      ORDER BY coalesce(p.start_time, d.start_time) ASC NULLS LAST, f.id ASC`,
    [from ?? null, to ?? null, employee_id ?? null],
    executor
  );
  return rows ?? [];
}

// ------------------------------------------------------------------- writes

// Creates the fulfillment, or returns the one the order already has.
//
// The order check is not defensive padding. orders.orders is only populated
// once ORDERS_SOURCE is on dual, so on a default deployment this is the state
// every order is in, and a foreign key violation surfacing as
// 'insert or update on table "fulfillments" violates foreign key constraint'
// tells the caller nothing about what to do next.
export async function create(
  { order_id, method_id, status = "PENDING", created_by_id = null },
  executor
) {
  const { rows: order } = await query(
    `SELECT 1 FROM orders.orders WHERE id = $1`,
    [order_id],
    executor
  );
  if (!order.length) {
    throw refuse(
      409,
      `cannot fulfill order ${order_id}: it is not in orders.orders. ` +
        `Orders reach the new schema through the orders dual-write, so this ` +
        `order exists only in exchange.`
    );
  }

  const { rows } = await query(
    `INSERT INTO fulfillments.fulfillments (order_id, method_id, status, created_by_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [order_id, method_id, status, created_by_id],
    executor
  );

  // DO NOTHING returns no row when the order already had one, which is the
  // normal case for a second call rather than an error - one fulfillment per
  // order is the rule, not a race to lose.
  const id = rows[0]?.id;
  return id ? await getById(id, executor) : await getByOrder(order_id, executor);
}

export async function setStatus({ id, status, updated_by_id = null }, executor) {
  const { rows } = await query(
    `UPDATE fulfillments.fulfillments
        SET status = $2, updated_at = now(), updated_by_id = coalesce($3, updated_by_id)
      WHERE id = $1
      RETURNING id`,
    [id, status, updated_by_id],
    executor
  );
  return rows[0] ? await getById(rows[0].id, executor) : null;
}

// Changing how an order will be handed over.
//
// The detail row goes with it. A fulfillment that was a PICKUP and becomes a
// SHIPMENT still has its pickups row otherwise, and every read here LEFT JOINs
// all three tables - so the response would carry both a pickup and a shipment
// and the caller would have to guess which one is true. Nothing in the schema
// prevents that; this does.
//
// The shipment link is deliberately NOT deleted. fulfillments.shipments points
// at a real shipping.shipments row with a tracking number and a label that was
// paid for, and a parcel does not stop existing because somebody changed a
// dropdown. Moving off SHIPMENT with a shipment still attached is refused
// instead, because cancelling the shipment is a different decision that costs
// money and belongs to features/shipping.
export async function setMethod({ id, method_id, updated_by_id = null }, executor) {
  const { rows: target } = await query(
    `SELECT category FROM fulfillments.methods WHERE id = $1`,
    [method_id],
    executor
  );
  const category = target[0]?.category;
  if (!category) throw refuse(404, `no such fulfillment method: ${method_id}`);

  const { rows: current } = await query(
    `SELECT m.category, EXISTS (
              SELECT 1 FROM fulfillments.shipments s WHERE s.fulfillment_id = f.id
            ) AS has_shipment
       FROM fulfillments.fulfillments f
       JOIN fulfillments.methods m ON m.id = f.method_id
      WHERE f.id = $1`,
    [id],
    executor
  );
  if (!current.length) throw refuse(404, `no such fulfillment: ${id}`);
  if (current[0].category === "SHIPMENT" && category !== "SHIPMENT" && current[0].has_shipment) {
    throw refuse(
      409,
      `fulfillment ${id} already has a shipment - cancel it through features/shipping ` +
        `before moving the order off SHIPMENT`
    );
  }

  await query(
    `UPDATE fulfillments.fulfillments
        SET method_id = $2, updated_at = now(), updated_by_id = coalesce($3, updated_by_id)
      WHERE id = $1`,
    [id, method_id, updated_by_id],
    executor
  );

  if (category !== "PICKUP") {
    await query(`DELETE FROM fulfillments.pickups WHERE fulfillment_id = $1`, [id], executor);
  }
  if (category !== "DIRECT") {
    await query(`DELETE FROM fulfillments.directs WHERE fulfillment_id = $1`, [id], executor);
  }

  return await getById(id, executor);
}

// Booking a pickup or an appointment is an upsert, not an insert: rescheduling
// is the common case and a fulfillment may hold only one of each
// (fulfillment_pickups_one_per_fulfillment, and its twin on directs).
//
// The category is checked against the method rather than trusted. Writing a
// pickup row for a fulfillment whose method is DROPSHIP produces a row every
// read joins and no read expects, and the constraint that would have caught it
// does not exist in the schema.
async function assertCategory(fulfillment_id, category, executor) {
  const { rows } = await query(
    `SELECT m.category
       FROM fulfillments.fulfillments f
       JOIN fulfillments.methods m ON m.id = f.method_id
      WHERE f.id = $1`,
    [fulfillment_id],
    executor
  );
  const found = rows[0]?.category;
  if (!found) throw refuse(404, `no such fulfillment: ${fulfillment_id}`);
  if (found !== category) {
    throw refuse(
      409,
      `fulfillment ${fulfillment_id} is a ${found}, not a ${category} - ` +
        `change the method before scheduling`
    );
  }
}

export async function schedulePickup(
  {
    fulfillment_id,
    pickup_address_id,
    assigned_employee_id = null,
    start_time = null,
    end_time = null,
  },
  executor
) {
  await assertCategory(fulfillment_id, "PICKUP", executor);
  await query(
    `INSERT INTO fulfillments.pickups (
       fulfillment_id, pickup_address_id, assigned_employee_id, start_time, end_time
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fulfillment_id) DO UPDATE SET
       pickup_address_id    = EXCLUDED.pickup_address_id,
       assigned_employee_id = EXCLUDED.assigned_employee_id,
       start_time           = EXCLUDED.start_time,
       end_time             = EXCLUDED.end_time`,
    [fulfillment_id, pickup_address_id, assigned_employee_id, start_time, end_time],
    executor
  );
  return await getById(fulfillment_id, executor);
}

export async function scheduleDirect(
  {
    fulfillment_id,
    location_id,
    is_appointment = true,
    assigned_employee_id = null,
    start_time = null,
    end_time = null,
  },
  executor
) {
  await assertCategory(fulfillment_id, "DIRECT", executor);
  await query(
    `INSERT INTO fulfillments.directs (
       fulfillment_id, location_id, assigned_employee_id, is_appointment, start_time, end_time
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (fulfillment_id) DO UPDATE SET
       location_id          = EXCLUDED.location_id,
       assigned_employee_id = EXCLUDED.assigned_employee_id,
       is_appointment       = EXCLUDED.is_appointment,
       start_time           = EXCLUDED.start_time,
       end_time             = EXCLUDED.end_time`,
    [fulfillment_id, location_id, assigned_employee_id, is_appointment, start_time, end_time],
    executor
  );
  return await getById(fulfillment_id, executor);
}

// Cancelling a booking removes the appointment, not the fulfillment. The order
// is still going to be fulfilled somehow; what changed is that nobody is due
// anywhere yet.
export async function cancelSchedule(fulfillment_id, executor) {
  await query(
    `DELETE FROM fulfillments.pickups WHERE fulfillment_id = $1`,
    [fulfillment_id],
    executor
  );
  await query(
    `DELETE FROM fulfillments.directs WHERE fulfillment_id = $1`,
    [fulfillment_id],
    executor
  );
  return await getById(fulfillment_id, executor);
}
