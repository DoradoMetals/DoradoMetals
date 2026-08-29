// fulfillments.pickups, and nothing else.
//
// WE collect from the customer. NOT shipping.pickups, which is a carrier
// collecting a parcel - two different things that share a word, and the
// backfill keeps them apart deliberately.
import query from "#shared/db/query.js";
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

export type PickupInput = {
  pickup_address_id: string;
  assigned_employee_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export async function upsert(
  id: string, fulfillment_id: string, p: PickupInput, executor?: Executor
): Promise<PickupRow> {
  const { rows } = await query<PickupRow>(
    sql("upsert"),
    [id, fulfillment_id, p.pickup_address_id, p.assigned_employee_id ?? null,
     p.start_time ?? null, p.end_time ?? null],
    executor
  );
  return rows[0];
}

export async function remove(fulfillment_id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [fulfillment_id], executor);
  return r.rowCount ?? 0;
}
