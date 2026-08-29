// shipping.carriers, and nothing else.
//
// A carrier is (id, logo, organization_id). Name, email, phone and enabled
// belong to the organization, and are written through ITS service - the update
// this replaces was a statement against organizations.organizations that had to
// join shipping.carriers to find its row.
import query from "#shared/db/query.js";
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

export async function create(
  id: string, organization_id: string, logo: string | null, executor?: Executor
): Promise<CarrierRow> {
  const { rows } = await query<CarrierRow>(sql("create"), [id, organization_id, logo], executor);
  return rows[0];
}

export async function update(
  id: string, logo: string | null, executor?: Executor
): Promise<CarrierRow | undefined> {
  const { rows } = await query<CarrierRow>(sql("update"), [logo, id], executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [id], executor);
  return r.rowCount ?? 0;
}
