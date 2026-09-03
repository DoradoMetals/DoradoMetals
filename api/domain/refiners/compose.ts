// A refiner and the organization it is, joined in memory — one read of organizations rather than a join per query.
// Inner-join semantics preserved deliberately: a refiner with no organization is dropped, since the wire shape declares one and nulls would leak where a caller reads a name.
import * as organizations from "#db/organizations/repo.ts";
import type { RefinerRow } from "#db/refiners/repo.ts";
// The row type comes from the contract, not the other feature's repo — same type, one less hop, and no type edge between two features that otherwise don't depend on each other (the VALUES dependency below is the real one).
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
  // created_at/updated_at come from the ORGANIZATION, not the refiner.
  created_at: o.created_at,
  updated_at: o.updated_at,
  organization: {
    id: o.id, name: o.name, email: o.email, phone: o.phone, enabled: o.enabled,
  },
});

// Sorts on the joined name column, moved here where the name now exists.
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
