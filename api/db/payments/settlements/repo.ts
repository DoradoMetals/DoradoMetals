import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentSettlement, PaymentSettlementPatch } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

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
