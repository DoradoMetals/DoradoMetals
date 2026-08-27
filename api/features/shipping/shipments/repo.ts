// shipping.shipments, and nothing else.
//
// THE ORDER LINK IS NOT IN THIS TABLE. exchange.shipments carries
// purchase_order_id and sales_order_id; this schema carries neither, because an
// order's FULFILLMENT is what knows about the order. compose.ts puts them back.
//
// carrier_service_id and package_id are projected so compose.ts can resolve
// them to the names exchange kept inline, and are dropped again on the way out.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type Executor = PoolClient | undefined;

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
export async function create(
  id: string, direction: string, executor?: Executor
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql("create"), [id, direction], executor);
  return rows[0].id;
}

// The values sql/update.sql takes, in its order. The service resolves the
// service and package NAMES exchange stores into the ids this table wants.
export type ShipmentValues = [
  string | null, string | null,
  Date | string | null, Date | string | null, Date | string | null,
  string | Buffer | null, string | null, string | null,
  string | null, string | null,
  number | null, boolean, number | null, string | null,
];

export async function update(
  id: string, values: ShipmentValues, executor?: Executor
): Promise<string | undefined> {
  const { rows } = await query<{ id: string }>(sql("update"), [...values, id], executor);
  return rows[0]?.id;
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

export async function remove(id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount ?? 0;
}
