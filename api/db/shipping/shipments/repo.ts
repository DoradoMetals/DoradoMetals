// shipping.shipments: no order link here - a fulfillment knows the order; compose.ts puts it back.
// carrier_service_id/package_id are projected for compose.ts to resolve, then dropped again.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { ShipmentPatchColumns } from "@dorado/contracts";
import type { OrderViewShipment, Shipment, ShipmentRead } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// `direction` is projected as text - the wire has always carried a string.
export type ShipmentBaseRow = Omit<
  Pick<
    Shipment,
    | "id" | "carrier_service_id" | "package_id" | "recipient_address_id"
    | "shipper_address_id" | "tracking_number" | "shipping_status"
    | "est_delivery" | "shipped_at" | "delivered_at" | "created_at" | "label"
    | "label_type" | "pickup_type" | "cost" | "insured" | "declared_value"
    | "direction"
  >,
  "direction"
> & { direction: string | null };

export async function getAll(executor?: Executor): Promise<ShipmentBaseRow[]> {
  const { rows } = await query<ShipmentBaseRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<ShipmentBaseRow | undefined> {
  const { rows } = await query<ShipmentBaseRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// THE VIEW'S PROJECTION - the row without its label, which is what a read
// serves (see sql/get_read.sql). Distinct from getOne above, whose row is what
// a WRITE reads back before rewriting every column verbatim.
export async function getRead(
  id: string, executor?: Executor
): Promise<ShipmentRead | undefined> {
  const { rows } = await query<ShipmentRead>(sql("get_read"), [id], executor);
  return rows[0];
}

// Every parcel on one order, same projection. The order id is resolved through
// fulfillments.shipments in the statement - this table carries none.
export async function getReadForOrder(
  order_id: string, executor?: Executor
): Promise<ShipmentRead[]> {
  const { rows } = await query<ShipmentRead>(sql("get_read_for_order"), [order_id], executor);
  return rows;
}

// THE SAME PARCELS WITH THEIR LABELS, base64-encoded. One consumer: the order
// view the PDF renderer draws a label page from - see sql/get_for_order.sql
// for why every other read takes the projection above instead.
export async function getForOrder(
  order_id: string, executor?: Executor
): Promise<OrderViewShipment[]> {
  const { rows } = await query<OrderViewShipment>(sql("get_for_order"), [order_id], executor);
  return rows;
}

export async function getMany(
  ids: string[], executor?: Executor
): Promise<ShipmentBaseRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<ShipmentBaseRow>(sql("get_many"), [ids], executor);
  return rows;
}

// A shipment exists before its label is bought, so only id and direction are
// required; a caller that already holds the carrier's answer writes the parcel
// in one statement instead of creating a shell and updating it (D214 item 11).
export type ShipmentNew = {
  id: string; direction: string;
  tracking_number?: string | null; shipping_status?: string | null;
  label?: string | Buffer | null; label_type?: string | null;
  pickup_type?: string | null; package_id?: string | null;
  carrier_service_id?: string | null; cost?: number | null;
  insured?: boolean | null; declared_value?: number | null;
};

export async function create(row: ShipmentNew, executor?: Executor): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [
      row.id, row.direction, row.tracking_number ?? null, row.shipping_status ?? null,
      row.label ?? null, row.label_type ?? null, row.pickup_type ?? null,
      row.package_id ?? null, row.carrier_service_id ?? null, row.cost ?? null,
      row.insured ?? null, row.declared_value ?? null,
    ],
    executor
  );
  return rows[0].id;
}

// A KEY PRESENT IS WRITTEN, A KEY ABSENT LEAVES THE COLUMN ALONE
// (shared/db/patch.ts), which is what a PATCH means. It used to be a full
// replace of all fourteen columns, so every caller had to read the row, copy
// every column it was not changing, and write the lot back - a read-modify-
// write in the service for what the database can express directly, and one
// forgotten column away from blanking a bought label.
export type ShipmentPatchRow = {
  tracking_number?: string | null;
  shipping_status?: string | null;
  est_delivery?: Date | string | null;
  shipped_at?: Date | string | null;
  delivered_at?: Date | string | null;
  label?: string | Buffer | null;
  label_type?: string | null;
  pickup_type?: string | null;
  package_id?: string | null;
  carrier_service_id?: string | null;
  cost?: number | null;
  actual_cost?: number | null;
  insured?: boolean;
  declared_value?: number | null;
  direction?: string | null;
};

// THE COLUMNS, FROM THE CONTRACT (ruling 64). ShipmentPatchColumns is the
// table minus its key, its two address ids (written once at creation) and the
// stamped `created_at` - so a column added to shipping.shipments becomes
// writable by naming it there, not here.
export const PATCHABLE = Object.keys(
  ShipmentPatchColumns.shape
) as readonly (keyof ShipmentPatchColumns)[];

export async function update(
  id: string, patch: ShipmentPatchRow, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "shipping.shipments", allowed: PATCHABLE, patch, where: { id },
    // The column is an enum; the parameter arrives as text.
    casts: { direction: "shipping.direction" },
  });
  // Nothing to change is not an error - the caller reads the row back either
  // way.
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

// The shipping cost of every parcel on one order. Narrow on purpose - one column keyed on an order, not a whole-row rewrite of update().
// Lives here because only the feature owning shipping.shipments should ever write it - two writers to one table go out of step.
export async function setChargeForOrder(
  orderId: string, cost: number | null, executor?: Executor
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    sql("set_charge_for_order"), [cost, orderId], executor
  );
  return rows.map((r) => r.id);
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
