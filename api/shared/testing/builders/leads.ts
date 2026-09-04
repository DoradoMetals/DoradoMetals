import type { PoolClient } from "pg";
import type { LeadPatch } from "@dorado/contracts";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as leads from "#db/leads/repo.ts";

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
