// GET /api/orders/:orderId/shipments - the order's parcels, verbatim shipping.shipments rows, both directions in one array (not two named slots).
// Code lives with shipping (owns the table); path lives under /api/orders (order id is the key the caller holds).
import path from "node:path";
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Lives in domain/ (a composed read, not CRUD); its statement is in db/shipping/shipments/sql.
const sql = sqlFrom(path.join(import.meta.dirname, "..", "..", "..", "db", "shipping", "shipments"));

type Executor = PoolClient | undefined;

// The verbatim row, with `direction` as text - see sql/get_for_order.sql.
type OrderShipmentRow = Omit<shipping.shipments.Row, "direction"> & {
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
