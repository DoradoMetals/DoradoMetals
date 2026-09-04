// rates.rates, and nothing else.
//
// No join: the metal's name is composed in domain/rates/compose.ts from one cached lookup, rather than a join on every read.
// update takes an id and a patch and answers whether a row changed; no per-column wrapper lives here.
// max_qty is nullable (null means an open-ended band): the statement is built from the keys the patch carries, so omitting max_qty leaves it untouched but sending null clears it to open-ended.
// created_by, updated_by, created_at and updated_at are the public.audit_stamp trigger's, from the actor on the connection (migration 116).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf, ACTOR_IDS } from "#shared/db/columns.ts";
import { Rate, RatePatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// THE COLUMNS, FROM THE CONTRACT (ruling 64) - the six writable ones.
export const PATCHABLE = columnsOf(RatePatch);

// The wire's projection: every column but the actor ids audit_stamp writes.
const RETURNING = returningOf(Rate.omit(ACTOR_IDS));

// ONE WRITE TYPE, AND A CREATE SENDS IT TOO (Jacob, 2026-09-03: "For new, it
// can just send the patch!!"). An explicit id wins on create; omitting one
// lets create.sql generate one. A column the table needs and the patch does
// not carry comes back as the shared pg-error translation naming it.
type RateCreate = RatePatch & { id?: string | null };

export async function getOne(id: string, executor?: Executor): Promise<Rate | undefined> {
  const { rows } = await query<Rate>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<Rate[]> {
  const { rows } = await query<Rate>(sql("get_all"), [], executor);
  return rows;
}

export async function create(row: RateCreate, executor?: Executor): Promise<Rate> {
  const { rows } = await query<Rate>(
    sql("create"),
    [row.id, row.metal_id, row.unit, row.min_qty, row.max_qty, row.scrap_pct, row.bullion_pct],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: RatePatch, executor?: Executor
): Promise<Rate | undefined> {
  const built = buildUpdate({
    table: "rates.rates", allowed: PATCHABLE, patch, where: { id }, returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<Rate>(built.text, built.values, executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
