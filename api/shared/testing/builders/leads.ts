// aLead - a sales lead. The smallest builder in the set, and the one that
// shows the shape most plainly: a repo call, literal defaults, a readable tag.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as leads from "#db/leads/repo.ts";

export type LeadOptions = {
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  priority?: string | null;
  notes?: string | null;
};

export async function aLead(c: PoolClient, options: LeadOptions = {}) {
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
