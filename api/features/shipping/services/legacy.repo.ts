// exchange.carrier_services. THIS FILE IS SCHEDULED FOR DELETION.
//
// Takes the SAME values array as repo.ts, in the same order. Three of the
// columns are named differently here and the statements differ only in that.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import { updateParams } from "#features/shipping/services/repo.ts";
import type { Executor, ServiceValues } from "#features/shipping/services/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function create(
  id: string, values: ServiceValues, executor?: Executor
): Promise<void> {
  await query(sql("legacy/create"), [id, ...values], executor);
}

export async function update(
  id: string, values: ServiceValues, executor?: Executor
): Promise<void> {
  await query(sql("legacy/update"), updateParams(id, values), executor);
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("legacy/delete"), [id], executor);
}
