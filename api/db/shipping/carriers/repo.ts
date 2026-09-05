import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Carrier, ComposedCarrier } from "@dorado/contracts";
import { ComposedCarrier as View } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export async function view(
  id: string | null, executor?: Executor
): Promise<ComposedCarrier[]> {
  const { rows } = await query(sql("view"), [id], executor);
  return rows.map((row) => View.parse(row));
}

export async function getAll(executor?: Executor): Promise<Carrier[]> {
  const { rows } = await query<Carrier>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<Carrier | undefined> {
  const { rows } = await query<Carrier>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function create(
  row: Pick<Carrier, "id" | "organization_id" | "logo">, executor?: Executor
): Promise<Carrier> {
  const { rows } = await query<Carrier>(
    sql("create"), [row.id, row.organization_id, row.logo], executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: Pick<Carrier, "logo">, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("update"), [patch.logo, id], executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
