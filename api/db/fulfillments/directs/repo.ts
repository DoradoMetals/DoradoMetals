// fulfillments.directs: the customer comes to a location, by appointment or walking in - `is_appointment` tells them apart.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type DirectRow = fulfillments.DirectsRow;

type Window = { from?: string | null; to?: string | null; employee_id?: string | null };

export async function getFor(
  fulfillment_id: string, executor?: Executor
): Promise<DirectRow | undefined> {
  const { rows } = await query<DirectRow>(sql("get_for"), [fulfillment_id], executor);
  return rows[0];
}

export async function getMany(ids: string[], executor?: Executor): Promise<DirectRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<DirectRow>(sql("get_many"), [ids], executor);
  return rows;
}

export async function getScheduled(
  { from = null, to = null, employee_id = null }: Window = {}, executor?: Executor
): Promise<DirectRow[]> {
  const { rows } = await query<DirectRow>(
    sql("get_scheduled"), [from, to, employee_id], executor
  );
  return rows;
}

// upsert-only, no separate create/update: rescheduling is the common case, and a fulfillment holds only one.
export type DirectInput = {
  location_id: string;
  assigned_employee_id?: string | null;
  is_appointment?: boolean;
  start_time?: string | null;
  end_time?: string | null;
};

export type DirectNew = DirectInput & { id: string; fulfillment_id: string };

export async function upsert(row: DirectNew, executor?: Executor): Promise<DirectRow> {
  const { rows } = await query<DirectRow>(
    sql("upsert"),
    [
      row.id, row.fulfillment_id, row.location_id, row.assigned_employee_id,
      row.is_appointment, row.start_time, row.end_time,
    ],
    executor
  );
  return rows[0];
}

export async function remove(fulfillment_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [fulfillment_id], executor);
  return rowCount === 1;
}
