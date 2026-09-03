// shipping.carriers: id, logo, organization_id. Name/email/phone/enabled belong to the organization and update through its own service.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { shipping } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type CarrierRow = shipping.CarriersRow;

export async function getAll(executor?: Executor): Promise<CarrierRow[]> {
  const { rows } = await query<CarrierRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<CarrierRow | undefined> {
  const { rows } = await query<CarrierRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export type CarrierNew = Pick<CarrierRow, "id" | "organization_id" | "logo">;

export async function create(row: CarrierNew, executor?: Executor): Promise<CarrierRow> {
  const { rows } = await query<CarrierRow>(
    sql("create"), [row.id, row.organization_id, row.logo], executor
  );
  return rows[0];
}

// Replaces `logo` whole, null included - not a COALESCE patch.
export type CarrierPatch = Pick<CarrierRow, "logo">;

export async function update(
  id: string, patch: CarrierPatch, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql("update"), [patch.logo, id], executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
