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

export async function getAllRefiners(executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} ORDER BY o.name ASC, r.id ASC`,
    [],
    executor
  );
  return rows;
}

export async function getRefinerFromId(id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} WHERE r.id = $1`,
    [id],
    executor
  );
  return rows[0];
}
