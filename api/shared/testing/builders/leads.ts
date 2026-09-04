// aLead - a sales lead. The smallest builder in the set, and the one that
// shows the shape most plainly: a repo call, literal defaults, a readable tag.
import type { PoolClient } from "pg";
import type { LeadPatch } from "@dorado/contracts";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as leads from "#db/leads/repo.ts";

// The contract's own patch shape, not a hand-rolled options bag: `id` is the
// one field LeadPatch never carries (a create may name its own; an update
// never can - see db/leads/repo.ts's LeadCreate), so it is added here.
export async function aLead(
  c: PoolClient, options: Partial<LeadPatch> & { id?: string } = {}
) {
  const tag = aTag();
  return leads.create(
    {
      id: options.id ?? anId(),
      name: options.name ?? `Test Lead ${tag}`,
      phone: options.phone ?? "2145550100",
      email: options.email ?? `${tag}@dorado.test`,
      priority: options.priority ?? "Medium",
      notes: options.notes ?? null,
    },
    c
  );
}
