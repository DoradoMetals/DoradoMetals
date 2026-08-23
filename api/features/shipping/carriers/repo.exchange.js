// Carriers read from the exchange schema, which currently serves traffic.
//
// Projected explicitly rather than SELECT *, matching repo.next.js so the two
// return the same shape.
import query from "#shared/db/query.js";

// Composed into the new shape: a carrier and the organization it is. exchange
// holds both in one flat row, so this builds the nested object out of it and the
// two implementations return the same thing.
const FIELDS = `
  id, logo, created_at, updated_at,
  jsonb_build_object(
    'name', name,
    'email', email,
    'phone', phone,
    'enabled', is_active
  ) AS organization
`;

export async function getAll(client) {
  const q = `SELECT ${FIELDS} FROM exchange.carriers ORDER BY name ASC, id ASC`;
  const { rows } = await query(q, [], client);
  return rows ?? [];
}

export async function getById(id, client) {
  const q = `SELECT ${FIELDS} FROM exchange.carriers WHERE id = $1 LIMIT 1`;
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
    RETURNING ${FIELDS};
  `;

  const vals = [
    carrier.organization?.name,
    carrier.organization?.email,
    carrier.organization?.phone,
    carrier.logo,
    carrier.organization?.enabled,
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
    RETURNING ${FIELDS};
  `;

  const vals = [
    carrier.organization?.name,
    carrier.organization?.email,
    carrier.organization?.phone,
    carrier.logo,
    carrier.organization?.enabled,
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