// payments.settlements, and nothing else.
//
// WHAT ACTUALLY MOVED. An intent records what was asked for and an attempt what
// was tried; a settlement only exists once money has changed hands. In DOLLARS.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { PaymentSettlement } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);


export type NewSettlement = {
  id: string;
  attempt_id: string;
  settled_amount: number;
  provider: string | null;
  provider_ref: string;
};

// THE COLUMNS, FROM THE CONTRACT (ruling 64): the row without its identity and
// without created_at, which the database stamps.
export const PATCHABLE = columnsOf(
  PaymentSettlement.omit({ id: true, attempt_id: true, created_at: true })
);

export type SettlementPatch = Partial<Pick<PaymentSettlement, (typeof PATCHABLE)[number]>>;

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
export async function create(row: NewSettlement, executor?: Executor): Promise<PaymentSettlement> {
  const { rows } = await query<PaymentSettlement>(
    sql("create"),
    [row.id, row.attempt_id, row.settled_amount, row.provider, row.provider_ref],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: SettlementPatch, executor?: Executor
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
