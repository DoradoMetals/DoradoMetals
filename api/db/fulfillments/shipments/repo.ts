import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { FulfillmentShipmentPatch } from "@dorado/contracts";
import type { FulfillmentShipment } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function getFor(
  fulfillment_id: string, executor?: Executor
): Promise<FulfillmentShipment[]> {
  const { rows } = await query<FulfillmentShipment>(sql("get_for"), [fulfillment_id], executor);
  return rows;
}

export async function getMany(ids: string[], executor?: Executor): Promise<FulfillmentShipment[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<FulfillmentShipment>(sql("get_many"), [ids], executor);
  return rows;
}

export async function getByShipment(
  shipment_ids: string[], executor?: Executor
): Promise<FulfillmentShipment[]> {
  if (shipment_ids.length === 0) return [];
  const { rows } = await query<FulfillmentShipment>(
    sql("get_by_shipment"), [shipment_ids], executor
  );
  return rows;
}

export async function existsFor(
  fulfillment_id: string, executor?: Executor
): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(
    sql("exists_for"), [fulfillment_id], executor
  );
  return rows[0]?.present === true;
}

export async function removeByShipment(
  shipment_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("delete_by_shipment"), [shipment_id], executor);
  return rowCount === 1;
}

export async function create(
  row: Pick<FulfillmentShipment, "fulfillment_id" | "shipment_id"> & FulfillmentShipmentPatch,
  executor?: Executor
): Promise<FulfillmentShipment> {
  const { rows } = await query<FulfillmentShipment>(
    sql("create"),
    [
      row.fulfillment_id, row.shipment_id,
      row.recipient_location_id ?? null, row.shipper_location_id ?? null,
    ],
    executor
  );
  return rows[0];
}

export const PATCHABLE = Object.keys(
  FulfillmentShipmentPatch.shape
) as readonly (keyof FulfillmentShipmentPatch)[];

export async function update(
  shipment_id: string, patch: FulfillmentShipmentPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.shipments", allowed: PATCHABLE, patch, where: { shipment_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
