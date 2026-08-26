// Refiners read from the new layout, where a refiner is two rows: an
// organization of type REFINER holding the contact details, and a refiners row
// holding the logo and carrying the original supplier id.
//
// That id is what makes this safe - exchange.products.supplier_id points at it,
// so nothing referencing a supplier has to change.
//
// The shape keeps the two apart: a refiner has an organization, and the response
// says so rather than flattening its fields to the top level. Separation of
// concerns - the organization is a different thing that happens to be joined in.
//
// features/refiners/wire.ts flattens it back for the frontend behind
// REFINERS_WIRE, which is a transformation rather than a rename.
import query from "#shared/db/query.js";
import type { refiners, organizations } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// A refiner is two rows in the new layout - the refiner itself and the
// organization it is - projected back into the flat shape exchange returned.
export type RefinerRow = Pick<refiners.RefinersRow, "id"> &
  Partial<Pick<organizations.OrganizationsRow, "name" | "email" | "phone" | "enabled">> &
  Record<string, unknown>;


const FIELDS = `
    r.id,
    r.logo,
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
    FROM refiners.refiners r
    JOIN organizations.organizations o ON o.id = r.organization_id
`;

export async function getAllRefiners(executor?: Executor): Promise<RefinerRow[]> {
  const { rows } = await query<RefinerRow>(
    `SELECT ${FIELDS} ${FROM} ORDER BY o.name ASC, r.id ASC`,
    [],
    executor
  );
  return rows;
}

export async function getRefinerFromId(
  id: string,
  executor?: Executor
): Promise<RefinerRow | undefined> {
  const { rows } = await query<RefinerRow>(
    `SELECT ${FIELDS} ${FROM} WHERE r.id = $1`,
    [id],
    executor
  );
  return rows[0];
}
