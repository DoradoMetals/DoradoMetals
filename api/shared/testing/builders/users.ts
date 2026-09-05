import type { PoolClient } from "pg";
import { anUnknownId, aTag } from "#shared/testing/builders/ids.ts";
import type { User } from "@dorado/contracts";

export type BuiltUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  dorado_funds: number;
  isAnonymous: boolean;
};

type UserAliases = { funds?: number; anonymous?: boolean };

export async function aUser(
  c: PoolClient, options: Partial<User> & UserAliases = {}
): Promise<BuiltUser> {
  const tag = aTag();
  const id = options.id ?? anUnknownId();
  const email = options.email ?? `${tag}@dorado.test`;
  const name = options.name ?? `Test Person ${tag}`;
  const role = options.role === undefined ? "user" : options.role;
  const funds = options.funds ?? 0;

  const { rows } = await c.query<BuiltUser>(
    `INSERT INTO auth.users (id, email, name, role, "emailVerified", dorado_funds,
                             phone_number, "isAnonymous")
     VALUES ($1, $2, $3, $4, true, $5, $6, $7)
     RETURNING id, email, name, role, dorado_funds, "isAnonymous"`,
    [id, email, name, role, funds, options.phone_number ?? null, options.anonymous === true]
  );
  const row = rows[0]!;
  return { ...row, dorado_funds: Number(row.dorado_funds ?? 0) };
}

export const anAdmin = (
  c: PoolClient, options: Partial<User> & UserAliases = {}
): Promise<BuiltUser> =>
  aUser(c, { ...options, role: "admin" });

export const aVisitor = (
  c: PoolClient, options: Partial<User> & UserAliases = {}
): Promise<BuiltUser> =>
  aUser(c, {
    ...options,
    anonymous: true,
    email: options.email ?? `temp-${anUnknownId()}@anonymous.dorado.invalid`,
    name: options.name ?? "Anonymous",
  });
