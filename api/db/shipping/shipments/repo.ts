// shipping.shipments, and nothing else.
//
// THE ORDER LINK IS NOT IN THIS TABLE. exchange.shipments carries
// purchase_order_id and sales_order_id; this schema carries neither, because an
// order's FULFILLMENT is what knows about the order. compose.ts puts them back.
//
// carrier_service_id and package_id are projected so compose.ts can resolve
// them to the names exchange kept inline, and are dropped again on the way out.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// `direction` is projected as text, because exchange's `type` is text and the
// wire has always carried a string.
export type ShipmentBaseRow = Omit<
  Pick<
    shipping.ShipmentsRow,
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

// A shell. Everything else arrives from the carrier afterwards, through
// update() - a shipment exists from the moment an order needs one, and the
// label is bought later.
export type ShipmentNew = { id: string; direction: string };

export async function create(row: ShipmentNew, executor?: Executor): Promise<string> {
  const { rows } = await query<{ id: string }>(sql("create"), [row.id, row.direction], executor);
  return rows[0].id;
}

// ONE UPDATE (D212's CRUD ruling): replaces the legacy positional-tuple
// `update` and `record`, which wrote the same statement under two calling
// conventions. THE ROW (Jacob, 2026-09-01): the caller maps named fields onto
// sql/update.sql's parameter order in exactly one place, here.
//
// NOT A COALESCE PATCH, deliberately: this is "everything the carrier told
// us", a full replace of all fourteen columns whenever it runs (see
// sql/update.sql's own header) - a field a caller omits writes NULL, exactly
// as it always has. The service resolves the service/package NAMES exchange
// stores into the ids this table wants before calling this.
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

// The shipping cost of every parcel on one order.
//
// Narrow on purpose. `update` above is a whole-row write of the fourteen things
// the carrier told us, keyed on the shipment id; this is one column keyed on an
// ORDER, which is what the purchase-order screen edits. Squeezing it into
// `update` would mean reading the row back first just to rewrite it unchanged.
//
// It lives HERE, in the feature that owns shipping.shipments, because
// purchase-orders used to write the table directly - see D41. Two writers to
// one table means only one of them dual-writes after a pivot, and the column
// goes quietly out of step between the schemas.
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
