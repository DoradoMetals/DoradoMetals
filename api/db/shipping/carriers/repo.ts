// shipping.carriers, and nothing else.
//
// A carrier is (id, logo, organization_id). Name, email, phone and enabled
// belong to the organization, and are written through ITS service - the update
// this replaces was a statement against organizations.organizations that had to
// join shipping.carriers to find its row.
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

// `logo` is the only column this table writes past create - name/email/phone/
// enabled belong to the organization. NOT a COALESCE patch: this table has
// always replaced logo whole, null included when the caller sends none (the
// service's own comment on updateCarrier says so), so the patch names it
// directly rather than leaving it alone when undefined.
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
