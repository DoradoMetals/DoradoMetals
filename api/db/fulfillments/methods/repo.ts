// fulfillments.methods: seeded reference data (047_seed_reference_data.sql) - exchange never recorded this.
// category is code, not data: SHIPMENT/PICKUP/DIRECT each name their detail table. label vs admin_label are both real - a customer and the admin need different words for the same row.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { FulfillmentMethodPatch } from "@dorado/contracts";
import type { FulfillmentMethodRead } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// created_by/updated_by(_id) aren't projected here - who edited a reference row isn't part of the menu. get_one.sql serves the whole row instead.
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

// By id, for composing a method into a fulfillment without a join per row - eleven rows, so a Map beats a join.
export async function byId(executor?: Executor): Promise<Map<string, FulfillmentMethodRead>> {
  return new Map((await getAll(executor)).map((m) => [m.id, m]));
}

// The default for a direction and category, for the flows that do not ask.
export async function getDefault(
  { direction, category }: { direction: string; category: string },
  executor?: Executor
): Promise<FulfillmentMethodRead | undefined> {
  const { rows } = await query<FulfillmentMethodRead>(
    sql("get_default"), [direction, category], executor
  );
  return rows[0];
}

// Every field is optional; an absent one is not written at all (shared/db/patch.ts) - none of these columns is nullable, so nothing is lost.
// THE COLUMNS, FROM THE CONTRACT (ruling 64) - not a second list that happens
// to agree with FulfillmentMethodPatch today.
export const PATCHABLE = Object.keys(
  FulfillmentMethodPatch.shape
) as readonly (keyof FulfillmentMethodPatch)[];

// No create, no remove: methods are code, not data - a method can be reworded and switched off, and nothing else.
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
