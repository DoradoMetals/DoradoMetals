// fulfillments.pickups: WE collect from the customer - not shipping.pickups (a carrier collecting a parcel). One row per fulfillment (fulfillment_pickups_one_per_fulfillment); the service reads first and calls create or update (D214 item 11).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { FulfillmentPickup } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type PickupRow = FulfillmentPickup;

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
  pickup_address_id?: string;
  assigned_employee_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type PickupNew = PickupInput & { id: string; fulfillment_id: string };

export async function create(row: PickupNew, executor?: Executor): Promise<PickupRow> {
  const { rows } = await query<PickupRow>(
    sql("create"),
    [
      row.id, row.fulfillment_id, row.pickup_address_id,
      row.assigned_employee_id ?? null, row.start_time ?? null, row.end_time ?? null,
    ],
    executor
  );
  return rows[0];
}

export const PATCHABLE = [
  "pickup_address_id", "assigned_employee_id", "start_time", "end_time",
] as const;
export type PickupPatch = Partial<Record<(typeof PATCHABLE)[number], string | null>>;

export async function update(
  fulfillment_id: string, patch: PickupPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.pickups", allowed: PATCHABLE, patch, where: { fulfillment_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(fulfillment_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [fulfillment_id], executor);
  return rowCount === 1;
}
