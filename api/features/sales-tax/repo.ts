// tax.sales_tax and tax.sales_tax_rules.
//
// TWO TABLES IN ONE FILE, and that is a deliberate exception to one-repo-one-
// table: sales_tax_rules is read whole and never written, so it has no CRUD of
// its own and splitting it into a folder would be a folder for a single SELECT.
// If it ever becomes writable it gets its own.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type TaxRule = {
  id: string;
  state_code: string;
  metal_category: string;
  product_type: string;
  min_price: number; max_price: number;
  purity_min: number; purity_max: number;
  aggregate_min: number; aggregate_max: number;
  weight_min: number; weight_max: number;
  is_domestic: boolean | null;
  is_legal_tender: boolean | null;
  tax_rate: number;
};

export async function reachedNexus(state: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ reached_nexus: boolean }>(sql("nexus"), [state], executor);
  return rows[0]?.reached_nexus ?? false;
}

export async function accrue(amount: number, state: string, executor?: Executor): Promise<void> {
  await query(sql("accrue"), [amount, state], executor);
}

export async function allRules(executor?: Executor): Promise<TaxRule[]> {
  const { rows } = await query<TaxRule>(sql("rules"), [], executor);
  return rows;
}
