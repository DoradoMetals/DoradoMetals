// A carrier and the organization it is, joined in memory.
// A carrier with no organization is dropped, not composed with nulls - resolveCarrier reads the org's NAME to pick a shipping provider, and a blank name would fail every label far from the cause.
import * as organizations from "#db/organizations/repo.ts";
// Row type comes from the contract, not the other feature's repo - avoids a type edge between features that don't otherwise depend on each other.
import type { ComposedCarrier, Organization, Carrier } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const compose = (c: Carrier, o: Organization): ComposedCarrier => ({
  id: c.id,
  logo: c.logo,
  // From the ORGANIZATION - shipping.carriers has no timestamps of its own.
  created_at: o.created_at,
  updated_at: o.updated_at,
  organization: {
    id: o.id, name: o.name, email: o.email, phone: o.phone, enabled: o.enabled,
  },
});

// Sorts by o.name then id - moved here from SQL since the name only exists after the join.
const byName = (a: ComposedCarrier, b: ComposedCarrier) =>
  (a.organization.name ?? "").localeCompare(b.organization.name ?? "") ||
  a.id.localeCompare(b.id);

export async function all(rows: Carrier[]): Promise<ComposedCarrier[]> {
  const orgs = await organizations.byId();
  return rows
    .flatMap((c) => {
      const o = c.organization_id === null ? undefined : orgs.get(c.organization_id);
      return o ? [compose(c, o)] : [];
    })
    .sort(byName);
}

export async function one(
  row: Carrier, executor?: Executor
): Promise<ComposedCarrier | null> {
  const o = row.organization_id === null
    ? undefined
    : await organizations.getOne(row.organization_id, executor);
  return o ? compose(row, o) : null;
}
