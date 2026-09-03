// payments.methods, and nothing else. Verbatim MethodsRow - the wire IS the
// row, which is what lets the frontend read the same contract.
//
// NO CREATE AND NO REMOVE: the rows are reference data seeded by migration
// (047/109), and a method is a capability of the business rather than
// something a request brings into being. update stays, because fees, labels
// and marketing copy are edited.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { payments } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type MethodRow = payments.MethodsRow;

export const PATCHABLE = [
  "enabled", "display", "label", "surcharge_label", "flat_fee",
  "surcharge_percent", "time_delay", "min_amount", "max_amount",
  "short_description", "long_description", "fit_description", "fit_header",
  "fit_bullets", "sort_order", "details", "image_id",
] as const;

export type MethodPatch = Partial<Pick<MethodRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<MethodRow | undefined> {
  const { rows } = await query<MethodRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<MethodRow[]> {
  const { rows } = await query<MethodRow>(sql("list"), [], executor);
  return rows;
}

export async function listFor(direction: string, executor?: Executor): Promise<MethodRow[]> {
  const { rows } = await query<MethodRow>(sql("list_for_direction"), [direction], executor);
  return rows;
}

// (direction, type) is the natural key - how a payout account and a Stripe
// instrument each resolve to a method_id.
export async function findByType(
  direction: string, type: string, executor?: Executor
): Promise<MethodRow | undefined> {
  const { rows } = await query<MethodRow>(sql("find_by_type"), [direction, type], executor);
  return rows[0];
}

export async function update(
  id: string, patch: MethodPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "payments.methods", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
