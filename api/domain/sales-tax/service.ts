import * as tax from "#db/sales-tax/repo.ts";
import type { TaxRule } from "#db/sales-tax/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

export async function isNexus(state: string, executor?: Executor): Promise<boolean> {
  return await tax.reachedNexus(state, executor);
}

export async function allRules(executor?: Executor): Promise<TaxRule[]> {
  return await tax.allRules(executor);
}

export async function updateStateSalesTax(
  amount: number,
  state: string | null,
  tx: Executor
): Promise<void> {
  if (state === null) return;
  await tax.accrue(amount, state, tx);
}
