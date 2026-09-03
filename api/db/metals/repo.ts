// metals.metals, and nothing else.
//
// READ ONLY: the four metals are seeded reference data, nothing writes them at runtime.
// getAll/namesById/idsByName keep their names rather than becoming list(): domain/orders and domain/products call these directly and are out of this pass's scope.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { metals } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

type MetalRow = metals.MetalsRow;

export async function getAll(executor?: Executor): Promise<MetalRow[]> {
  const { rows } = await query<MetalRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<MetalRow | undefined> {
  const { rows } = await query<MetalRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// Name by id, for callers that compose a metal's name into their own shape rather than joining. Four rows, so one query and a Map beats a join on every read.
export async function namesById(executor?: Executor): Promise<Map<string, string>> {
  const rows = await getAll(executor);
  return new Map(rows.map((m) => [m.id, m.name]));
}

// Id by NAME - the direction write paths need, since the new schema uses a foreign key where exchange matched by name string.
// A name that is not a metal comes back undefined rather than throwing; the caller decides whether to skip it or fail.
export async function idsByName(executor?: Executor): Promise<Map<string, string>> {
  const rows = await getAll(executor);
  return new Map(rows.map((m) => [m.name, m.id]));
}
