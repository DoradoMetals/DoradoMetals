import { randomUUID } from "node:crypto";
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { OrderAddressLink } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function getFor(
  order_id: string, executor?: Executor
): Promise<OrderAddressLink | undefined> {
  const { rows } = await query<OrderAddressLink>(sql("get_for"), [order_id], executor);
  return rows[0];
}

export async function getMany(
  order_ids: string[], executor?: Executor
): Promise<OrderAddressLink[]> {
  if (order_ids.length === 0) return [];
  const { rows } = await query<OrderAddressLink>(sql("get_many"), [order_ids], executor);
  return rows;
}

export async function create(
  row: Pick<OrderAddressLink, "order_id" | "address_id"> &
    Partial<Pick<OrderAddressLink, "id" | "source_address_id">>,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("create"),
    [row.id ?? randomUUID(), row.order_id, row.address_id, row.source_address_id ?? null],
    executor
  );
  return rowCount === 1;
}
