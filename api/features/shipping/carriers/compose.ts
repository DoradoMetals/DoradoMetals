// A carrier and the organization it is, joined in memory.
//
// Identical in structure to features/refiners/compose.ts, because a carrier and
// a refiner ARE the same kind of thing in the new design - an organization with
// a role. The implementation this replaces did it in SQL with a JOIN and
// jsonb_build_object; here each repo reads its own table.
//
// The nested shape is what wire.ts flattens for CARRIERS_WIRE=legacy, so this
// must produce exactly what that jsonb_build_object did.
//
// AN INNER JOIN DROPPED A CARRIER WITH NO ORGANIZATION, and so does this. That
// matters more here than for refiners: resolveCarrier reads the organization's
// NAME to pick a shipping provider, so a carrier composed with nulls where its
// organization should be would resolve to "" and fail every label with
// "Unsupported carrier" - later, and further from the cause, than dropping it.
import * as organizations from "#features/organizations/repo.ts";
import type { CarrierRow } from "#features/shipping/carriers/repo.ts";
import type { OrganizationRow } from "#features/organizations/repo.ts";

export type ComposedCarrier = {
  id: string;
  logo: string | null;
  created_at: OrganizationRow["created_at"];
  updated_at: OrganizationRow["updated_at"];
  organization: Pick<OrganizationRow, "id" | "name" | "email" | "phone" | "enabled">;
};

const compose = (c: CarrierRow, o: OrganizationRow): ComposedCarrier => ({
  id: c.id,
  logo: c.logo,
  // From the ORGANIZATION, not the carrier - that is what the old projection
  // selected (o.created_at, o.updated_at). shipping.carriers has no timestamps.
  created_at: o.created_at,
  updated_at: o.updated_at,
  organization: {
    id: o.id, name: o.name, email: o.email, phone: o.phone, enabled: o.enabled,
  },
});

// ORDER BY o.name ASC, c.id ASC - it sorted on the joined column, so the
// ordering moves here where the name exists.
const byName = (a: ComposedCarrier, b: ComposedCarrier) =>
  (a.organization.name ?? "").localeCompare(b.organization.name ?? "") ||
  a.id.localeCompare(b.id);

export async function all(rows: CarrierRow[]): Promise<ComposedCarrier[]> {
  const orgs = await organizations.byId();
  return rows
    .flatMap((c) => {
      const o = c.organization_id === null ? undefined : orgs.get(c.organization_id);
      return o ? [compose(c, o)] : [];
    })
    .sort(byName);
}

export async function one(
  row: CarrierRow, executor?: organizations.Executor
): Promise<ComposedCarrier | null> {
  const o = row.organization_id === null
    ? undefined
    : await organizations.getOne(row.organization_id, executor);
  return o ? compose(row, o) : null;
}
