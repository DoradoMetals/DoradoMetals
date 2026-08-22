// Suppliers read from the new layout, where a supplier is two rows: an
// organization of type REFINER holding the contact details, and a refiners row
// holding the logo and carrying the original supplier id.
//
// That id is what makes this safe - exchange.products.supplier_id points at it,
// so nothing referencing a supplier has to change.
//
// The wire shape is exchange.suppliers': flat, with is_active rather than
// enabled. The join and the renames stop here.
import query from "#shared/db/query.js";

const FIELDS = `
    r.id,
    o.name,
    o.email,
    o.phone,
    o.created_at,
    o.updated_at,
    r.logo,
    o.enabled AS is_active
`;

const FROM = `
    FROM refiners.refiners r
    JOIN organizations.organizations o ON o.id = r.organization_id
`;

export async function getAllSuppliers(executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} ORDER BY o.name ASC, r.id ASC`,
    [],
    executor
  );
  return rows;
}

export async function getSupplierFromId(id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} ${FROM} WHERE r.id = $1`,
    [id],
    executor
  );
  return rows[0];
}
