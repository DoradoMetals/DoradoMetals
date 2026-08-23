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

export async function getUser(user_id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM auth.users u WHERE u.id = $1`,
    [user_id],
    executor
  );
  return rows[0];
}

export async function getAllUsers(executor) {
  const { rows } = await query(
    `SELECT ${FIELDS}, u.dorado_funds FROM auth.users u ORDER BY u.role, u.id`,
    [],
    executor
  );
  return rows;
}

export async function getAdminUsers(executor) {
  const { rows } = await query(
    `SELECT ${FIELDS}, u.dorado_funds FROM auth.users u
     WHERE u.role = 'admin' ORDER BY u.name DESC, u.id DESC`,
    [],
    executor
  );
  return rows;
}
