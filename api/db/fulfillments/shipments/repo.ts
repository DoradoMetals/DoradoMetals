// fulfillments.shipments: THE LINK, not the parcel - joins a fulfillment to its shipping.shipments row, plus where it went from/to. Tracking, label, cost belong to the shipping feature.
// Also the first hop back to an order id: shipping.shipments carries no order id; the fulfillment does.
// The unique key is shipment_id, not fulfillment_id: a parcel belongs to exactly one fulfillment, but a fulfillment may have several parcels. The service reads by shipment_id first and calls create or update (D214 item 11).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { FulfillmentShipment } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ShipmentLinkRow = FulfillmentShipment;

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

export type ShipmentLinkInput = {
  shipment_id: string;
  recipient_location_id?: string | null;
  shipper_location_id?: string | null;
};

export type ShipmentLinkNew = ShipmentLinkInput & { id: string; fulfillment_id: string };

export async function create(row: ShipmentLinkNew, executor?: Executor): Promise<ShipmentLinkRow> {
  const { rows } = await query<ShipmentLinkRow>(
    sql("create"),
    [
      row.id, row.fulfillment_id, row.shipment_id,
      row.recipient_location_id ?? null, row.shipper_location_id ?? null,
    ],
    executor
  );
  return rows[0];
}

export const PATCHABLE = ["fulfillment_id", "recipient_location_id", "shipper_location_id"] as const;
export type ShipmentLinkPatch = Partial<Record<(typeof PATCHABLE)[number], string | null>>;

export async function update(
  shipment_id: string, patch: ShipmentLinkPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "fulfillments.shipments", allowed: PATCHABLE, patch, where: { shipment_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
