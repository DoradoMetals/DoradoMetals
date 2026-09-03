// aUser / anAdmin - a person, built rather than found.
//
// *** THE ONE BUILDER THAT DOES NOT GO THROUGH A REPO, AND WHY. *** Every
// other builder here inserts through `db/<feature>/repo.ts`, so the repo's own
// guards and the audit trigger apply. `db/users/repo.ts` has no create by
// design: better-auth owns `auth.users` and the feature keeps exactly one
// write, the credit balance. There is no repo call to make, so this writes the
// row itself and says so.
//
// *** SEEDING A USER FIRES THE IDENTITY MIRROR. *** Migration 107 (narrowed by
// 118) copies email/name/role from `auth.users` into `exchange.users` on
// INSERT, so a built user exists on both sides and every feature that still
// JOINs `exchange.users` for a name sees it. That is a write to a frozen table
// - permitted here because it happens inside a transaction that is rolled
// back, and `audit:test-leaks` is what proves the rollback held.
//
// The balance is a column of the row now (118), so `funds` is set at INSERT
// rather than through adjustCredit - a builder states a starting condition, it
// does not exercise the ledger.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";

export type BuiltUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  dorado_funds: number;
};

export type UserOptions = {
  id?: string;
  email?: string;
  name?: string;
  role?: string | null;
  funds?: number;
  phone_number?: string | null;
};

export async function aUser(c: PoolClient, options: UserOptions = {}): Promise<BuiltUser> {
  const tag = aTag();
  const id = options.id ?? anId();
  const email = options.email ?? `${tag}@dorado.test`;
  const name = options.name ?? `Test Person ${tag}`;
  const role = options.role === undefined ? "user" : options.role;
  const funds = options.funds ?? 0;

  const { rows } = await c.query<BuiltUser>(
    `INSERT INTO auth.users (id, email, name, role, "emailVerified", dorado_funds, phone_number)
     VALUES ($1, $2, $3, $4, true, $5, $6)
     RETURNING id, email, name, role, dorado_funds`,
    [id, email, name, role, funds, options.phone_number ?? null]
  );
  const row = rows[0]!;
  return { ...row, dorado_funds: Number(row.dorado_funds ?? 0) };
}

export const anAdmin = (c: PoolClient, options: UserOptions = {}): Promise<BuiltUser> =>
  aUser(c, { ...options, role: "admin" });
