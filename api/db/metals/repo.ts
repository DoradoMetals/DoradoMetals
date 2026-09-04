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

export async function namesById(executor?: Executor): Promise<Map<string, string>> {
  const rows = await list(executor);
  return new Map(rows.map((m) => [m.id, m.name]));
}

export async function idsByName(executor?: Executor): Promise<Map<string, string>> {
  const rows = await list(executor);
  return new Map(rows.map((m) => [m.name, m.id]));
}
