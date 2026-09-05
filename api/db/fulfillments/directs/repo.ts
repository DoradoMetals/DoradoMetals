import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { FulfillmentDirectPatchColumns } from "@dorado/contracts";
import type { FulfillmentDirect } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function getFor(
  fulfillment_id: string, executor?: Executor
): Promise<FulfillmentDirect | undefined> {
  const { rows } = await query<FulfillmentDirect>(sql("get_for"), [fulfillment_id], executor);
  return rows[0];
}

export async function getMany(ids: string[], executor?: Executor): Promise<FulfillmentDirect[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<FulfillmentDirect>(sql("get_many"), [ids], executor);
  return rows;
}


export async function create(
  row: Pick<FulfillmentDirect, "id" | "fulfillment_id"> & FulfillmentDirectPatchColumns,
  executor?: Executor
): Promise<FulfillmentDirect> {
  const { rows } = await query<FulfillmentDirect>(
    sql("create"),
    [
      row.id, row.fulfillment_id, row.location_id, row.assigned_employee_id ?? null,
      row.is_appointment ?? true, row.start_time ?? null, row.end_time ?? null,
    ],
    executor
  );
  return rows[0];
}

export const PATCHABLE = Object.keys(
  FulfillmentDirectPatchColumns.shape
) as readonly (keyof FulfillmentDirectPatchColumns)[];

export async function update(
  fulfillment_id: string, patch: FulfillmentDirectPatchColumns, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.directs", allowed: PATCHABLE, patch, where: { fulfillment_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(fulfillment_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [fulfillment_id], executor);
  return rowCount === 1;
}
