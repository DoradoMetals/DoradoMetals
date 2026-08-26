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
import type { shipping, organizations } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// The organization as it is embedded in a carrier.
//
// `id` is OPTIONAL on purpose and this is not an oversight: repo.exchange.js
// builds the same object out of one flat exchange.carriers row, and there is no
// organization id in that schema to put in it. repo.dual switches between the
// two, so the type has to admit both - and the wire contract
// (contracts/wire/shipping.ts CarrierWireNext) already declares it optional for
// exactly this reason. Nothing reads it; it is projected because the new schema
// has it.
export type CarrierOrganization = Pick<
  organizations.OrganizationsRow,
  "name" | "email" | "phone" | "enabled"
> &
  Partial<Pick<organizations.OrganizationsRow, "id">>;

// What both implementations return: the carrier, its timestamps, and the
// organization it is.
export type CarrierRow = Pick<shipping.CarriersRow, "id" | "logo"> &
  Pick<organizations.OrganizationsRow, "created_at" | "updated_at"> & {
    organization: CarrierOrganization;
  };

// What a caller supplies. This arrives as req.body, so every field is optional
// and the queries pass undefined through to the database as null.
export type CarrierInput = {
  id?: string;
  logo?: string | null;
  organization?: Partial<CarrierOrganization>;
};

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

export async function getAll(client?: Executor): Promise<CarrierRow[]> {
  const { rows } = await query<CarrierRow>(
    `SELECT ${FIELDS} ${FROM} ORDER BY o.name ASC, c.id ASC`,
    [],
    client
  );
  return rows ?? [];
}

// Returns null rather than undefined, matching repo.exchange.js - repo.dual
// hands back whichever is selected and callers compare against null.
export async function getById(id: string, client?: Executor): Promise<CarrierRow | null> {
  const { rows } = await query<CarrierRow>(
    `SELECT ${FIELDS} ${FROM} WHERE c.id = $1 LIMIT 1`,
    [id],
    client
  );
  return rows[0] ?? null;
}

// Returns "" for a carrier that does not exist, not null - the callers put this
// straight into a label and a string is what they need.
export async function getNameById(id: string, client?: Executor): Promise<string> {
  const { rows } = await query<Pick<organizations.OrganizationsRow, "name">>(
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
export async function create(
  carrier: CarrierInput,
  client?: Executor
): Promise<CarrierRow | null> {
  const { rows: orgRows } = await query<Pick<organizations.OrganizationsRow, "id">>(
    `INSERT INTO organizations.organizations (type, name, email, phone, enabled)
     VALUES ('CARRIER', $1, $2, $3, $4)
     RETURNING id`,
    [carrier.organization?.name, carrier.organization?.email,
     carrier.organization?.phone, carrier.organization?.enabled],
    client
  );

  const { rows } = await query<Pick<shipping.CarriersRow, "id">>(
    `INSERT INTO shipping.carriers (organization_id, logo)
     VALUES ($1, $2)
     RETURNING id`,
    [orgRows[0].id, carrier.logo],
    client
  );

  return getById(rows[0].id, client);
}

export async function update(
  carrier: CarrierInput,
  client?: Executor
): Promise<CarrierRow | null> {
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

  return getById(carrier.id as string, client);
}

// Removes both rows. The carrier row goes first because it holds the foreign
// key; dropping the organization first would be refused.
//
// Returns true unconditionally, exactly as repo.exchange.js does - it is not a
// report of whether anything was deleted, and typing it as one would be a lie.
export async function remove(id: string, client?: Executor): Promise<boolean> {
  const { rows } = await query<Pick<shipping.CarriersRow, "organization_id">>(
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
export async function mirrorCarrier(
  id: string,
  client?: Executor
): Promise<CarrierRow | null> {
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
