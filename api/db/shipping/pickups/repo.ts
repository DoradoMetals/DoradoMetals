// shipping.pickups: a CARRIER collecting a parcel - not fulfillments.pickups (us collecting from the customer). Order/user/carrier aren't columns; compose.ts reconstructs them from the shipment.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type PickupBaseRow = Pick<
  shipping.pickups.Row,
  "id" | "shipment_id" | "requested_at" | "status" | "confirmation_number" | "location"
>;

export async function getAll(executor?: Executor): Promise<PickupBaseRow[]> {
  const { rows } = await query<PickupBaseRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<PickupBaseRow | undefined> {
  const { rows } = await query<PickupBaseRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getByShipments(
  shipment_ids: string[], executor?: Executor
): Promise<PickupBaseRow[]> {
  if (shipment_ids.length === 0) return [];
  const { rows } = await query<PickupBaseRow>(
    sql("get_by_shipments"), [shipment_ids], executor
  );
  return rows;
}

// FULL REPLACE, not a COALESCE patch - the service merges the whole row before calling this.
// requested_at widens to admit a JS Date too; pg accepts either.
export type PickupWrite = Omit<
  Pick<shipping.pickups.Row, "requested_at" | "status" | "confirmation_number" | "location">,
  "requested_at"
> & { requested_at: Date | string | null };

export type PickupNew = PickupWrite & Pick<shipping.pickups.Row, "id" | "shipment_id">;

export async function create(row: PickupNew, executor?: Executor): Promise<PickupBaseRow> {
  const { rows } = await query<PickupBaseRow>(
    sql("create"),
    [row.id, row.shipment_id, row.requested_at, row.status, row.confirmation_number, row.location],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: PickupWrite, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"),
    [patch.requested_at, patch.status, patch.confirmation_number, patch.location, id],
    executor
  );
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
