// exchange.carriers. THIS FILE IS SCHEDULED FOR DELETION.
//
// exchange holds the carrier and its organization on one row, so this takes
// both halves. is_active is exchange's name for the organization's `enabled`.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type LegacyCarrier = {
  name?: string | null; email?: string | null; phone?: string | null;
  logo?: string | null; enabled?: boolean | null;
};

export async function create(id: string, c: LegacyCarrier, executor?: Executor): Promise<void> {
  await query(sql("create"),
    [id, c.name ?? null, c.email ?? null, c.phone ?? null, c.logo ?? null, c.enabled ?? null], executor);
}

export async function update(id: string, c: LegacyCarrier, executor?: Executor): Promise<void> {
  await query(sql("update"),
    [id, c.name ?? null, c.email ?? null, c.phone ?? null, c.logo ?? null, c.enabled ?? null], executor);
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("delete"), [id], executor);
}
