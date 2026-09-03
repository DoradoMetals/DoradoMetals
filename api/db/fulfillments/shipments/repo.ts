// fulfillments.shipments: THE LINK, not the parcel - joins a fulfillment to its shipping.shipments row, plus where it went from/to. Tracking, label, cost belong to the shipping feature.
// Also the first hop back to an order id: shipping.shipments carries no order id; the fulfillment does.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ShipmentLinkRow = fulfillments.ShipmentsRow;

// Returns a LIST - the unique index is on shipment_id, so a fulfillment may have several parcels.
export async function getFor(
  fulfillment_id: string, executor?: Executor
): Promise<ShipmentLinkRow[]> {
  const { rows } = await query<ShipmentLinkRow>(sql("get_for"), [fulfillment_id], executor);
  return rows;
}

export async function getMany(ids: string[], executor?: Executor): Promise<ShipmentLinkRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<ShipmentLinkRow>(sql("get_many"), [ids], executor);
  return rows;
}

// From the parcel's side - the read the shipping feature needs to reconstruct an order id.
export async function getByShipment(
  shipment_ids: string[], executor?: Executor
): Promise<ShipmentLinkRow[]> {
  if (shipment_ids.length === 0) return [];
  const { rows } = await query<ShipmentLinkRow>(
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

// Unlinking a parcel, for when the shipment itself is deleted - the fulfillment survives.
export async function removeByShipment(
  shipment_id: string, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("delete_by_shipment"), [shipment_id], executor);
  return rowCount === 1;
}

// upsert-only, no separate create/update: linking a parcel is an upsert, conflict target shipment_id (see sql/upsert.sql).
export type ShipmentLinkInput = {
  shipment_id: string;
  recipient_location_id?: string | null;
  shipper_location_id?: string | null;
};

export type ShipmentLinkNew = ShipmentLinkInput & { id: string; fulfillment_id: string };

export async function upsert(row: ShipmentLinkNew, executor?: Executor): Promise<ShipmentLinkRow> {
  const { rows } = await query<ShipmentLinkRow>(
    sql("upsert"),
    [row.id, row.fulfillment_id, row.shipment_id, row.recipient_location_id, row.shipper_location_id],
    executor
  );
  return rows[0];
}
