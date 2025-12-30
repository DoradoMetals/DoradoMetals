import query from "#shared/db/query.js";

export async function getAll(client) {
  const q = `
    SELECT *
    FROM exchange.carrier_services
    ORDER BY name ASC
  `;
  const { rows } = await query(q, [], client);
  return rows ?? [];
}

export async function getById(id, client) {
  const q = `
    SELECT *
    FROM exchange.carrier_services
    WHERE id = $1
    LIMIT 1
  `;
  const { rows } = await query(q, [id], client);
  return rows[0] ?? null;
}

export async function getByCarrierId(carrier_id, client) {
  const q = `
    SELECT *
    FROM exchange.carrier_services
    WHERE carrier_id = $1
    ORDER BY name ASC
  `;
  const { rows } = await query(q, [carrier_id], client);
  return rows ?? [];
}

export async function create(service, client) {
  const q = `
    INSERT INTO exchange.carrier_services (
      carrier_id,
      name
    )
    VALUES ($1, $2)
    RETURNING *;
  `;

  const vals = [service.carrier_id, service.name];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function update(service, client) {
  const q = `
    UPDATE exchange.carrier_services
    SET
      carrier_id = $1,
      name = $2,
      description = $3,
      code = $4,
      provider_code = $5,
      min_transit_days = $6,
      max_transit_days = $7,
      supports_pickup = $8,
      supports_dropoff = $9,
      supports_returns = $10,
      max_weight_lbs = $11,
      max_length_in = $12,
      max_width_in = $13,
      max_height_in = $14,
      supports_insurance = $15,
      max_declared_value = $16,
      is_international = $17,
      is_residential = $18,
      is_active = $19,
      display_order = $20,
      updated_by = $21,
      updated_at = NOW()
    WHERE id = $22
    RETURNING *;
  `;

  const vals = [
    service.carrier_id,
    service.name,
    service.description ?? null,
    service.code,
    service.provider_code ?? null,
    service.min_transit_days ?? 0,
    service.max_transit_days ?? 0,
    !!service.supports_pickup,
    service.supports_dropoff == null ? true : !!service.supports_dropoff,
    !!service.supports_returns,
    service.max_weight_lbs ?? null,
    service.max_length_in ?? null,
    service.max_width_in ?? null,
    service.max_height_in ?? null,
    !!service.supports_insurance,
    service.max_declared_value ?? null,
    !!service.is_international,
    service.is_residential == null ? true : !!service.is_residential,
    service.is_active == null ? true : !!service.is_active,
    service.display_order ?? 0,
    service.updated_by ?? "Dorado Metals",
    service.id,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function remove(id, client) {
  const q = `
    DELETE FROM exchange.carrier_services
    WHERE id = $1
  `;
  await query(q, [id], client);
  return true;
}
