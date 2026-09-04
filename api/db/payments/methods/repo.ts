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
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentMethod, PaymentMethodPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// THE COLUMNS, FROM THE CONTRACT (ruling 64) - `PaymentMethodPatch` is
// already the row without its identity (id, direction, type, currency),
// without what the PROVIDER decides it can do (supports_partial /
// supports_split / provider / provider_value) and without the audit columns.
// What is left is the presentation and the money an admin edits.
export const PATCHABLE = columnsOf(PaymentMethodPatch);

export async function getOne(id: string, executor?: Executor): Promise<PaymentMethod | undefined> {
  const { rows } = await query<PaymentMethod>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<PaymentMethod[]> {
  const { rows } = await query<PaymentMethod>(sql("list"), [], executor);
  return rows;
}

export async function listFor(direction: string, executor?: Executor): Promise<PaymentMethod[]> {
  const { rows } = await query<PaymentMethod>(sql("list_for_direction"), [direction], executor);
  return rows;
}

// (direction, type) is the natural key - how a payout account and a Stripe
// instrument each resolve to a method_id.
export async function findByType(
  direction: string, type: string, executor?: Executor
): Promise<PaymentMethod | undefined> {
  const { rows } = await query<PaymentMethod>(sql("find_by_type"), [direction, type], executor);
  return rows[0];
}

export async function update(
  id: string, patch: PaymentMethodPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "payments.methods", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
