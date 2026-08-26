// Carriers read from the new layout, where a carrier is two rows: an
// organization of type CARRIER holding name, contact details and enabled, and a
// shipping.carriers row holding the logo and carrying the original carrier id.
//
// That id surviving matters more here than for suppliers. FEDEX_CARRIER_ID in
// providers/fedex/constants.js is a literal uuid, and exchange.shipments.carrier_id
// references it - so if the id moved, label creation would break.
//
// The shape keeps the two apart: a carrier has an organization, and the response
// says so rather than flattening its fields to the top level.
// features/shipping/carriers/wire.ts flattens it back for the frontend behind
// CARRIERS_WIRE, which is a transformation rather than a rename.
import query from "#shared/db/query.js";

const FIELDS = `
    c.id,
    c.logo,
    o.created_at,
    o.updated_at,
    jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'email', o.email,
      'phone', o.phone,
      'enabled', o.enabled
    ) AS organization
`;

const FROM = `
    FROM shipping.carriers c
    JOIN organizations.organizations o ON o.id = c.organization_id
`;

export async function getAll(client) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} ORDER BY o.name ASC, c.id ASC`,
    [],
    client
  );
  return rows ?? [];
}

export async function getById(id, client) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} WHERE c.id = $1 LIMIT 1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

export async function getNameById(id, client) {
  const { rows } = await query(
    `SELECT o.name ${FROM} WHERE c.id = $1 LIMIT 1`,
    [id],
    client
  );
  return rows[0]?.name ?? "";
}

// A carrier is created as two rows. The organization is inserted first because
// shipping.carriers references it, and both happen in whatever transaction the
// caller supplies - a carrier that exists in one table and not the other would
// be invisible to getAll while still holding its id.
export async function create(carrier, client) {
  const { rows: orgRows } = await query(
    `INSERT INTO organizations.organizations (type, name, email, phone, enabled)
     VALUES ('CARRIER', $1, $2, $3, $4)
     RETURNING id`,
    [carrier.organization?.name, carrier.organization?.email,
     carrier.organization?.phone, carrier.organization?.enabled],
    client
  );

  const { rows } = await query(
    `INSERT INTO shipping.carriers (organization_id, logo)
     VALUES ($1, $2)
     RETURNING id`,
    [orgRows[0].id, carrier.logo],
    client
  );

  return getById(rows[0].id, client);
}

export async function update(carrier, client) {
  await query(
    `UPDATE organizations.organizations o
     SET name = $1, email = $2, phone = $3, enabled = $4, updated_at = NOW()
     FROM shipping.carriers c
     WHERE c.organization_id = o.id AND c.id = $5`,
    [carrier.organization?.name, carrier.organization?.email,
     carrier.organization?.phone, carrier.organization?.enabled, carrier.id],
    client
  );

  await query(
    `UPDATE shipping.carriers SET logo = $1 WHERE id = $2`,
    [carrier.logo, carrier.id],
    client
  );

  return getById(carrier.id, client);
}

// Removes both rows. The carrier row goes first because it holds the foreign
// key; dropping the organization first would be refused.
export async function remove(id, client) {
  const { rows } = await query(
    `DELETE FROM shipping.carriers WHERE id = $1 RETURNING organization_id`,
    [id],
    client
  );
  if (rows[0]?.organization_id) {
    await query(
      `DELETE FROM organizations.organizations WHERE id = $1`,
      [rows[0].organization_id],
      client
    );
  }
  return true;
}

// Copies a carrier from exchange, id included, creating or overwriting both
// rows. Server-side, so no value is materialised in a client.
export async function mirrorCarrier(id, client) {
  await query(
    `INSERT INTO organizations.organizations (id, type, name, email, phone, enabled, created_at, updated_at)
     SELECT COALESCE(c.organization_id, gen_random_uuid()), 'CARRIER',
            e.name, e.email, e.phone, e.is_active, e.created_at, e.updated_at
     FROM exchange.carriers e
     LEFT JOIN shipping.carriers c ON c.id = e.id
     WHERE e.id = $1
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
       enabled = EXCLUDED.enabled, created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [id],
    client
  );

  await query(
    `INSERT INTO shipping.carriers (id, organization_id, logo)
     SELECT e.id,
            (SELECT o.id FROM organizations.organizations o
             WHERE o.type = 'CARRIER' AND o.name = e.name LIMIT 1),
            e.logo
     FROM exchange.carriers e
     WHERE e.id = $1
     ON CONFLICT (id) DO UPDATE SET logo = EXCLUDED.logo`,
    [id],
    client
  );

  return getById(id, client);
}
