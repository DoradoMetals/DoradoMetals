import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { ShipmentPatchColumns, ShipmentViewFacts as Facts } from "@dorado/contracts";
import type {
  OrderViewShipment, ShipmentDirection, ShipmentRead, ShipmentViewFacts, ShipmentWrite,
} from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function view(
  id: string | null, order_id: string | null, executor?: Executor
): Promise<ShipmentViewFacts[]> {
  const { rows } = await query(sql("view"), [id, order_id], executor);
  return rows.map((row) => Facts.parse(row));
}

export async function getAll(executor?: Executor): Promise<OrderViewShipment[]> {
  const { rows } = await query<OrderViewShipment>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(
  id: string, executor?: Executor
): Promise<OrderViewShipment | undefined> {
  const { rows } = await query<OrderViewShipment>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getRead(
  id: string, executor?: Executor
): Promise<ShipmentRead | undefined> {
  const { rows } = await query<ShipmentRead>(sql("get_read"), [id], executor);
  return rows[0];
}

export async function getReadForOrder(
  order_id: string, executor?: Executor
): Promise<ShipmentRead[]> {
  const { rows } = await query<ShipmentRead>(sql("get_read_for_order"), [order_id], executor);
  return rows;
}

export async function getForOrder(
  order_id: string, executor?: Executor
): Promise<OrderViewShipment[]> {
  const { rows } = await query<OrderViewShipment>(sql("get_for_order"), [order_id], executor);
  return rows;
}

export async function getMany(
  ids: string[], executor?: Executor
): Promise<OrderViewShipment[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<OrderViewShipment>(sql("get_many"), [ids], executor);
  return rows;
}

export async function create(
  row: ShipmentWrite & { direction: ShipmentDirection },
  executor?: Executor
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [
      row.direction, row.tracking_number ?? null, row.shipping_status ?? null,
      row.label ?? null, row.label_type ?? null, row.pickup_type ?? null,
      row.package_id ?? null, row.carrier_service_id ?? null, row.cost ?? null,
      row.insured ?? null, row.declared_value ?? null,
    ],
    executor
  );
  return rows[0].id;
}

export const PATCHABLE = Object.keys(
  ShipmentPatchColumns.shape
) as readonly (keyof ShipmentPatchColumns)[];

export async function update(
  id: string, patch: ShipmentWrite, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "shipping.shipments", allowed: PATCHABLE, patch, where: { id },
    casts: { direction: "shipping.direction" },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

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
