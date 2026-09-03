// shipping.pickups, and nothing else.
//
// A CARRIER collecting a parcel. NOT fulfillments.pickups, which is US
// collecting from a customer - two different things that share a word, and the
// backfill keeps them apart deliberately.
//
// The order, the user and the carrier are not columns here: this table hangs a
// pickup off a SHIPMENT and the shipment knows the rest. compose.ts puts them
// back.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type PickupBaseRow = Pick<
  shipping.PickupsRow,
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

type PickupWrite = {
  requested_at: Date | string | null;
  status: string | null;
  confirmation_number: string | null;
  location: string | null;
};

export async function create(
  id: string, shipment_id: string, p: PickupWrite, executor?: Executor
): Promise<PickupBaseRow> {
  const { rows } = await query<PickupBaseRow>(
    sql("create"),
    [id, shipment_id, p.requested_at, p.status, p.confirmation_number, p.location],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, p: PickupWrite, executor?: Executor
): Promise<PickupBaseRow | undefined> {
  const { rows } = await query<PickupBaseRow>(
    sql("update"),
    [p.requested_at, p.status, p.confirmation_number, p.location, id],
    executor
  );
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount ?? 0;
}
