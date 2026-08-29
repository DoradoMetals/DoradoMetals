// fulfillments.shipments, and nothing else.
//
// THE LINK, NOT THE PARCEL. This table joins a fulfillment to the
// shipping.shipments row that satisfies it, and records where it went from and
// to. Tracking number, label and cost belong to features/shipping.
//
// It is also the first hop of putting an order id back onto a shipment:
// shipping.shipments carries neither purchase_order_id nor sales_order_id,
// because an order's FULFILLMENT is what knows about the order.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { fulfillments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ShipmentLinkRow = fulfillments.ShipmentsRow;

// RETURNS A LIST - the unique index is on shipment_id, so a fulfillment may
// have several parcels. See sql/get_for.sql.
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

// From the parcel's side. This is the read features/shipping needs to
// reconstruct an order id.
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

// Unlinking a parcel, for when the shipment itself is deleted. The fulfillment
// survives - see sql/delete_by_shipment.sql.
export async function removeByShipment(
  shipment_id: string, executor?: Executor
): Promise<number> {
  const r = await query(sql("delete_by_shipment"), [shipment_id], executor);
  return r.rowCount ?? 0;
}

export type ShipmentLinkInput = {
  shipment_id: string;
  recipient_location_id?: string | null;
  shipper_location_id?: string | null;
};

export async function upsert(
  id: string, fulfillment_id: string, s: ShipmentLinkInput, executor?: Executor
): Promise<ShipmentLinkRow> {
  const { rows } = await query<ShipmentLinkRow>(
    sql("upsert"),
    [id, fulfillment_id, s.shipment_id,
     s.recipient_location_id ?? null, s.shipper_location_id ?? null],
    executor
  );
  return rows[0];
}
