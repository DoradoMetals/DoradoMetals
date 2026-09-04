// payments.settlements, and nothing else.
//
// WHAT ACTUALLY MOVED. An intent records what was asked for and an attempt what
// was tried; a settlement only exists once money has changed hands. In DOLLARS.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentSettlement, PaymentSettlementPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// THE COLUMNS, FROM THE CONTRACT (ruling 64) - `PaymentSettlementPatch` is
// already the row without its identity (id, attempt_id) and without
// created_at, which the database stamps.
export const PATCHABLE = columnsOf(PaymentSettlementPatch);

export async function getOne(id: string, executor?: Executor): Promise<PaymentSettlement | undefined> {
  const { rows } = await query<PaymentSettlement>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(attempt_id: string, executor?: Executor): Promise<PaymentSettlement[]> {
  const { rows } = await query<PaymentSettlement>(
    sql("list_for_attempt"), [attempt_id], executor
  );
  return rows;
}

// IDEMPOTENT: a Stripe webhook is retried, and a retry must rewrite the same
// row rather than raise or mint a second one. See sql/create.sql.
//
// id AND attempt_id ARE SEPARATE PARAMETERS, not patch fields - the same
// split payments/details' create makes, and for the same reason:
// PaymentSettlementPatch omits both because they are the row's identity, not
// something a caller patches.
export async function create(
  id: string, attempt_id: string, patch: PaymentSettlementPatch, executor?: Executor
): Promise<PaymentSettlement> {
  const { rows } = await query<PaymentSettlement>(
    sql("create"),
    [id, attempt_id, patch.settled_amount, patch.provider, patch.provider_ref],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: PaymentSettlementPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "payments.settlements", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
