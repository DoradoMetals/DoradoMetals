// A refiner and the organization it is, joined in memory.
//
// The implementation this replaces did it in SQL - `JOIN
// organizations.organizations o ON o.id = r.organization_id` - and built the
// nested object with jsonb_build_object. Here each repo reads its own table and
// the two are put together here, from ONE read of organizations rather than a
// join per query.
//
// The nested shape is what wire.ts then flattens for REFINERS_WIRE=legacy, so
// this must produce exactly what the old jsonb_build_object did.
//
// AN INNER JOIN DROPPED A REFINER WITH NO ORGANIZATION, and so does this. That
// is preserved deliberately: the wire shape declares an organization, and a
// refiner without one would put nulls where a caller reads a name.
import * as organizations from "#features/organizations/repo.ts";
import type { RefinerRow } from "#features/refiners/repo.ts";
// THE ROW TYPE COMES FROM THE CONTRACT, NOT FROM THE OTHER FEATURE'S REPO.
// It used to be imported as `OrganizationRow` from
// #features/organizations/repo.ts, where it is declared as a one-line alias
// of exactly this. Naming the contract directly is the same type with one
// less hop, and it removes a type edge between two features that have no
// other reason to depend on each other - this file already reads the
// organizations repo for its VALUES, which is the dependency that is real.
import type { organizations as organizationTables } from "@dorado/contracts";

export type ComposedRefiner = {
  id: string;
  logo: string | null;
  created_at: organizationTables.OrganizationsRow["created_at"];
  updated_at: organizationTables.OrganizationsRow["updated_at"];
  organization: Pick<organizationTables.OrganizationsRow, "id" | "name" | "email" | "phone" | "enabled">;
};

const compose = (r: RefinerRow, o: organizationTables.OrganizationsRow): ComposedRefiner => ({
  id: r.id,
  logo: r.logo,
  // created_at and updated_at come from the ORGANIZATION, not the refiner -
  // that is what the old projection selected (o.created_at, o.updated_at).
  created_at: o.created_at,
  updated_at: o.updated_at,
  organization: {
    id: o.id, name: o.name, email: o.email, phone: o.phone, enabled: o.enabled,
  },
});

// ORDER BY o.name ASC, r.id ASC - it sorted on the joined column, so the
// ordering moves here where the name exists.
const byName = (a: ComposedRefiner, b: ComposedRefiner) =>
  (a.organization.name ?? "").localeCompare(b.organization.name ?? "") ||
  a.id.localeCompare(b.id);

export async function all(rows: RefinerRow[]): Promise<ComposedRefiner[]> {
  const orgs = await organizations.byId();
  return rows
    .flatMap((r) => {
      const o = r.organization_id === null ? undefined : orgs.get(r.organization_id);
      return o ? [compose(r, o)] : [];
    })
    .sort(byName);
}

export async function one(row: RefinerRow): Promise<ComposedRefiner | null> {
  const o = row.organization_id === null ? undefined : await organizations.getOne(row.organization_id);
  return o ? compose(row, o) : null;
}
