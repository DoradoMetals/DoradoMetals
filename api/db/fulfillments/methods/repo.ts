import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { FulfillmentMethodPatch } from "@dorado/contracts";
import type { FulfillmentMethodRead } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function getAvailable(
  direction: string, executor?: Executor
): Promise<FulfillmentMethodRead[]> {
  const { rows } = await query<FulfillmentMethodRead>(sql("get_available"), [direction], executor);
  return rows;
}

export async function getAll(executor?: Executor): Promise<FulfillmentMethodRead[]> {
  const { rows } = await query<FulfillmentMethodRead>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<FulfillmentMethodRead | undefined> {
  const { rows } = await query<FulfillmentMethodRead>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function byId(executor?: Executor): Promise<Map<string, FulfillmentMethodRead>> {
  return new Map((await getAll(executor)).map((m) => [m.id, m]));
}

export async function getDefault(
  direction: string, category: string, executor?: Executor
): Promise<FulfillmentMethodRead | undefined> {
  const { rows } = await query<FulfillmentMethodRead>(
    sql("get_default"), [direction, category], executor
  );
  return rows[0];
}

export const PATCHABLE = Object.keys(
  FulfillmentMethodPatch.shape
) as readonly (keyof FulfillmentMethodPatch)[];

export async function update(
  id: string, patch: FulfillmentMethodPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.methods", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
