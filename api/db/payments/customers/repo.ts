// auth.users."stripeCustomerId", and nothing else.
//
// A ROW WITH TWO OWNERS, SPLIT BY COLUMN - the arrangement migration 107 built
// and CLAUDE.md records. Identity (name, email, role, ban state) is
// better-auth's and the users feature's; the provider's id for the customer is
// a PAYMENT fact, so payments owns that one column and reads the three it needs
// to open a Stripe customer with. No other write reaches this table from here.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { BillingIdentity, User } from "@dorado/contracts";

const sql = sqlFrom(import.meta.dirname);

// better-auth spells the column in camelCase, so the identifier must be
// quoted - and the quotes are part of the name buildUpdate whitelists.
export const STRIPE_CUSTOMER = '"stripeCustomerId"';

export const PATCHABLE = [STRIPE_CUSTOMER] as const;
// Keyed by the same quoted identifier as PATCHABLE, so a caller can only ever
// build a patch buildUpdate will accept - `User["stripeCustomerId"]` is the
// value type the column actually holds, taken from the contract rather than
// re-typed here. Not exported: nothing outside `update` below needs the name.
type CustomerPatch = Partial<Record<typeof STRIPE_CUSTOMER, User["stripeCustomerId"]>>;

export async function getOne(
  user_id: string, executor?: Executor
): Promise<BillingIdentity | undefined> {
  const { rows } = await query<BillingIdentity>(sql("get_one"), [user_id], executor);
  return rows[0];
}

// Keyed by the user's own id, which is the customer link's key: there is one
// provider customer per user.
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
