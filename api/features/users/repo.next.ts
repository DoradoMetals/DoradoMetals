// Users read from auth.users.
//
// The column names are identical to exchange.users, quoted camelCase and all -
// auth.users is exchange.users plus a phone_number the old table never had. So
// this is the same query against a different schema, and the wire shape is
// unchanged by construction rather than by aliasing.
//
// phone_number is deliberately not returned. exchange.users has no such column,
// and adding it to the response would be a wire change.
//
// There is no write here, and that is the whole design. better-auth owns every
// write to exchange.users and makes them through its own pool, so the mirror
// lives in the database instead - see migration 056. Reading from auth.users is
// safe because a trigger keeps it in step with whatever better-auth does.
import query from "#shared/db/query.js";
import type { auth } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// auth.users is where better-auth's users live in the new schema. The reads
// here ALIAS createdAt/updatedAt/emailVerified into snake_case for the wire, so
// this is the projection rather than the row - the row type is the source for
// what exists, not for what comes back.
//
// auth had no generated contract at all until tonight; it was one of three
// schemas (with checkout and refiners) missing from the generator's list.
export type UserRow = Pick<auth.UsersRow, "id" | "email" | "name" | "role" | "image"> &
  Record<string, unknown>;


const FIELDS = `
    u.id,
    u.email,
    u.name,
    u."createdAt"     AS created_at,
    u."updatedAt"     AS updated_at,
    u."emailVerified" AS email_verified,
    u.image,
    u.role
`;

export async function getUser(
  user_id: string,
  executor?: Executor
): Promise<UserRow | undefined> {
  const { rows } = await query<UserRow>(
    `SELECT ${FIELDS} FROM auth.users u WHERE u.id = $1`,
    [user_id],
    executor
  );
  return rows[0];
}

export async function getAllUsers(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(
    `SELECT ${FIELDS}, u.dorado_funds FROM auth.users u ORDER BY u.role, u.id`,
    [],
    executor
  );
  return rows;
}

export async function getAdminUsers(executor?: Executor): Promise<UserRow[]> {
  const { rows } = await query<UserRow>(
    `SELECT ${FIELDS}, u.dorado_funds FROM auth.users u
     WHERE u.role = 'admin' ORDER BY u.name DESC, u.id DESC`,
    [],
    executor
  );
  return rows;
}
