import query from "#shared/db/query.js";

export async function getAll(client) {
  const q = `
    SELECT *
    FROM exchange.carriers
    ORDER BY name ASC
  `;
  const { rows } = await query(q, [], client);
  return rows ?? [];
}

export async function getById(id, client) {
  const q = `
    SELECT *
    FROM exchange.carriers
    WHERE id = $1
    LIMIT 1
  `;
  const { rows } = await query(q, [id], client);
  return rows[0] ?? null;
}

export async function create(carrier, client) {
  const q = `
    INSERT INTO exchange.carriers (
      name,
      email,
      phone,
      logo,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const vals = [
    carrier.name,
    carrier.email,
    carrier.phone,
    carrier.logo,
    carrier.is_active,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function update(carrier, client) {
  const q = `
    UPDATE exchange.carriers
    SET
      name = $1,
      email = $2,
      phone = $3,
      logo = $4,
      is_active = $5,
      updated_at = NOW()
    WHERE id = $6
    RETURNING *;
  `;

  const vals = [
    carrier.name,
    carrier.email,
    carrier.phone,
    carrier.logo,
    carrier.is_active,
    carrier.id,
  ];

  const { rows } = await query(q, vals, client);
  return rows[0] ?? null;
}

export async function remove(id, client) {
  const q = `
    DELETE FROM exchange.carriers
    WHERE id = $1
  `;
  await query(q, [id], client);
  return true;
}

export async function getNameById(id, client) {
  const q = `
    SELECT name
    FROM exchange.carriers
    WHERE id = $1
    LIMIT 1
  `;
  const { rows } = await query(q, [id], client);
  return rows[0]?.name ?? "";
}