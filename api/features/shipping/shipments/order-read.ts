// GET /api/orders/:orderId/shipments - the order's parcels as VERBATIM
// shipping.shipments rows, BOTH DIRECTIONS IN ONE ARRAY.
//
// This is the read that retires the shipment / return_shipment slot naming.
// The composed order wire carried two named members built from one table by
// branching on the row's own `direction` column in JavaScript; the frontend
// filters on that column now, which also makes a second outbound parcel
// representable for the first time - `getByOrder` in service.ts has always
// answered with rows[0] and thrown the rest away.
//
// The CODE lives with shipping because shipping owns the table; the PATH
// lives under /api/orders because the order id is the key the caller holds -
// reads resolve from the parent path, writes key by the resource's own id
// (PATCH /shipments/:id, unchanged).
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

type Executor = PoolClient | undefined;

// The verbatim row, with `direction` as text - see sql/get_for_order.sql.
type OrderShipmentRow = Omit<shipping.ShipmentsRow, "direction"> & {
  direction: string;
};

export async function getForOrder(
  order_id: string, executor?: Executor
): Promise<OrderShipmentRow[]> {
  const { rows } = await query<OrderShipmentRow>(
    sql("get_for_order"), [order_id], executor
  );
  return rows;
}
