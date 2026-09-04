// metals.metals, and nothing else.
//
// READ ONLY: the four metals are seeded reference data, nothing writes them at runtime.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Metal } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);


export async function list(executor?: Executor): Promise<Metal[]> {
  const { rows } = await query<Metal>(sql("get_all"), [], executor);
  return rows;
}

export async function getOne(id: string, executor?: Executor): Promise<Metal | undefined> {
  const { rows } = await query<Metal>(sql("get_one"), [id], executor);
  return rows[0];
}

// Name by id, for callers that compose a metal's name into their own shape rather than joining. Four rows, so one query and a Map beats a join on every read.
export async function namesById(executor?: Executor): Promise<Map<string, string>> {
  const rows = await list(executor);
  return new Map(rows.map((m) => [m.id, m.name]));
}

// Id by NAME - the direction write paths need, since the new schema uses a foreign key where exchange matched by name string.
// A name that is not a metal comes back undefined rather than throwing; the caller decides whether to skip it or fail.
export async function idsByName(executor?: Executor): Promise<Map<string, string>> {
  const rows = await list(executor);
  return new Map(rows.map((m) => [m.name, m.id]));
}
