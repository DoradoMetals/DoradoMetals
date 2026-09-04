// payments.settlements, and nothing else.
//
// WHAT ACTUALLY MOVED. An intent records what was asked for and an attempt what
// was tried; a settlement only exists once money has changed hands. In DOLLARS.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { PaymentSettlement } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type SettlementRow = PaymentSettlement;

export type NewSettlement = {
  id: string;
  attempt_id: string;
  settled_amount: number;
  provider: string | null;
  provider_ref: string;
};

export const PATCHABLE = [
  "settled_amount", "provider", "provider_ref", "settled_at",
] as const;

export type SettlementPatch = Partial<Pick<SettlementRow, (typeof PATCHABLE)[number]>>;

export async function getOne(id: string, executor?: Executor): Promise<SettlementRow | undefined> {
  const { rows } = await query<SettlementRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function listFor(attempt_id: string, executor?: Executor): Promise<SettlementRow[]> {
  const { rows } = await query<SettlementRow>(
    sql("list_for_attempt"), [attempt_id], executor
  );
  return rows;
}

// IDEMPOTENT: a Stripe webhook is retried, and a retry must rewrite the same
// row rather than raise or mint a second one. See sql/create.sql.
export async function create(row: NewSettlement, executor?: Executor): Promise<SettlementRow> {
  const { rows } = await query<SettlementRow>(
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
