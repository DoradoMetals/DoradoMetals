// metals.metals, and nothing else.
//
// READ ONLY, and that is a statement about the data rather than an omission:
// the four metals are seeded reference data and nothing in the application
// writes them. A create/update/delete here would be API surface for something
// that only ever changes by migration.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { metals } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type MetalRow = metals.MetalsRow;
export type Executor = PoolClient | undefined;

export async function getAll(executor?: Executor): Promise<MetalRow[]> {
  const { rows } = await query<MetalRow>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<MetalRow | undefined> {
  const { rows } = await query<MetalRow>(sql("get_one"), [id], executor);
  return rows[0];
}

// Name by id, for the features that compose a metal's name into their own
// shape rather than joining to get it. Four rows, so one query and a Map beats
// a join on every read - and it keeps the join out of the repos that need it.
export async function namesById(executor?: Executor): Promise<Map<string, string>> {
  const rows = await getAll(executor);
  return new Map(rows.map((m) => [m.id, m.name]));
}
