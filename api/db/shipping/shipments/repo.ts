// shipping.shipments: no order link here - a fulfillment knows the order; compose.ts puts it back.
// carrier_service_id/package_id are projected for compose.ts to resolve, then dropped again.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Shipment } from "@dorado/contracts";
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

// NOT a COALESCE patch - a full replace of all fourteen columns; a field a caller omits writes NULL.
// Caller resolves the carrier's service/package name into this table's id before calling this.
export type ShipmentRecord = {
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
  insured?: boolean;
  declared_value?: number | null;
  direction?: string | null;
};

export async function update(
  id: string, row: ShipmentRecord, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"),
    [
      row.tracking_number, row.shipping_status,
      row.est_delivery, row.shipped_at, row.delivered_at,
      row.label, row.label_type, row.pickup_type,
      row.package_id, row.carrier_service_id,
      row.cost, row.insured, row.declared_value,
      row.direction, id,
    ],
    executor
  );
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
