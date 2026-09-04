import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { BillingIdentity, User } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

export const STRIPE_CUSTOMER = '"stripeCustomerId"';

export const PATCHABLE = [STRIPE_CUSTOMER] as const;
type CustomerPatch = Partial<Record<typeof STRIPE_CUSTOMER, User["stripeCustomerId"]>>;

export async function getOne(
  user_id: string, executor?: Executor
): Promise<BillingIdentity | undefined> {
  const { rows } = await query<BillingIdentity>(sql("get_one"), [user_id], executor);
  return rows[0];
}

export async function update(
  user_id: string, patch: CustomerPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "auth.users", allowed: PATCHABLE, patch, where: { id: user_id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}
