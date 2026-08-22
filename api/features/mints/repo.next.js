// Mints read from the products schema.
//
// A mint is now two rows: products.mints holds what is specific to minting -
// name, type, country - and the organization it belongs to holds the things
// any organization has, description and website among them. Both are projected
// back into the flat shape exchange returned, so callers are unchanged.
//
// The join is inner rather than left: organization_id is NOT NULL and unique
// per mint, so a mint without an organization is a broken row, and returning it
// with nulls would hide that.
//
// created_at and updated_at are timestamptz here where exchange stored them
// naive. exchange's values are UTC - the container runs UTC, which both
// Dockerfiles now pin - so the two agree, and the comparison in the parity
// check converts rather than assuming.
import query from "#shared/db/query.js";

const MINT_FIELDS = `
  mint.id,
  mint.name,
  mint.type,
  mint.country,
  org.description,
  org.website,
  mint.created_at,
  mint.updated_at
`;

const FROM = `
  FROM products.mints mint
  JOIN organizations.organizations org ON org.id = mint.organization_id
`;

export async function getAllMints(executor) {
  const { rows } = await query(
    `SELECT ${MINT_FIELDS} ${FROM} ORDER BY mint.name ASC, mint.id ASC`,
    [],
    executor
  );
  return rows;
}
