// fulfillments.pickups: WE collect from the customer - not shipping.pickups (a carrier collecting a parcel).
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type PickupRow = fulfillments.PickupsRow;

type Window = { from?: string | null; to?: string | null; employee_id?: string | null };

export async function getFor(
  fulfillment_id: string, executor?: Executor
): Promise<PickupRow | undefined> {
  const { rows } = await query<PickupRow>(sql("get_for"), [fulfillment_id], executor);
  return rows[0];
}

export async function getMany(ids: string[], executor?: Executor): Promise<PickupRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<PickupRow>(sql("get_many"), [ids], executor);
  return rows;
}

export async function getScheduled(
  { from = null, to = null, employee_id = null }: Window = {}, executor?: Executor
): Promise<PickupRow[]> {
  const { rows } = await query<PickupRow>(
    sql("get_scheduled"), [from, to, employee_id], executor
  );
  return rows;
}

// upsert-only, no separate create/update: rescheduling is common, and a fulfillment holds only one (fulfillment_pickups_one_per_fulfillment).
export type PickupInput = {
  pickup_address_id: string;
  assigned_employee_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type PickupNew = PickupInput & { id: string; fulfillment_id: string };

export async function upsert(row: PickupNew, executor?: Executor): Promise<PickupRow> {
  const { rows } = await query<PickupRow>(
    sql("upsert"),
    [
      row.id, row.fulfillment_id, row.pickup_address_id,
      row.assigned_employee_id, row.start_time, row.end_time,
    ],
    executor
  );
  return rows[0];
}

export async function remove(fulfillment_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [fulfillment_id], executor);
  return rowCount === 1;
}
