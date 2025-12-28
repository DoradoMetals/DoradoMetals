import query from "#shared/db/query.js";

export async function getAll(client) {
  const q = `
    SELECT *
    FROM exchange.carrier_pickups
    ORDER BY pickup_requested_at DESC
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
    ORDER BY pickup_requested_at DESC
  `;
  const { rows } = await query(q, [order_id], client);
  return rows ?? [];
}

export async function create(pickup, client) {
  const q = `
    INSERT INTO exchange.carrier_pickups (
      shipment_id,
      pickup_requested_at,
      pickup_status,
      confirmation_number,
      location
    )
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *;
  `;

  const vals = [
    pickup.shipment_id,
    pickup.pickup_requested_at,
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
      shipment_id = $1,
      pickup_requested_at = $2,
      pickup_status = $3,
      confirmation_number = $4,
      location = $5
    WHERE id = $6
    RETURNING *;
  `;

  const vals = [
    pickup.shipment_id,
    pickup.pickup_requested_at,
    pickup.pickup_status,
    pickup.confirmation_number,
    pickup.location,
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
