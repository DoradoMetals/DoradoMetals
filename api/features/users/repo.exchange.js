// Users as they live in exchange.users, which better-auth owns.
//
// Renamed from repo.js when the feature was split. The only change is that
// every read now accepts an executor and threads it, so a read can join its
// caller's transaction - adjustUserCredit already did, and the reads did not.
import query from "#shared/db/query.js";

export async function getUser(user_id, executor) {
  const sql = `
    SELECT curr_user.id, curr_user.email, curr_user.name, curr_user."createdAt" AS created_at, curr_user."updatedAt" AS updated_at, curr_user."emailVerified" AS email_verified, curr_user.image, curr_user.role
    FROM exchange.users curr_user
    WHERE id = $1
  `;
  const values = [user_id];
  const result = await query(sql, values, executor);
  return result.rows[0];
}

export async function getAllUsers(executor) {
  const sql = `
    SELECT curr_user.id, curr_user.email, curr_user.name, curr_user."createdAt" AS created_at, curr_user."updatedAt" AS updated_at, curr_user."emailVerified" AS email_verified, curr_user.image, curr_user.role, curr_user.dorado_funds
    FROM exchange.users curr_user
    ORDER BY curr_user.role, curr_user.id
  `;
  const values = [];
  const result = await query(sql, values, executor);
  return result.rows;
}

export async function getAdminUsers(executor) {
  const sql = `
    SELECT curr_user.id, curr_user.email, curr_user.name, curr_user."createdAt" AS created_at, curr_user."updatedAt" AS updated_at, curr_user."emailVerified" AS email_verified, curr_user.image, curr_user.role, curr_user.dorado_funds
    FROM exchange.users curr_user
    WHERE role = 'admin'
    ORDER BY curr_user.name DESC, curr_user.id DESC
  `;
  const values = [];
  const result = await query(sql, values, executor);
  return result.rows;
}

export async function adjustUserCredit(user_id, mode, amount, executor) {
  const sql = `
    UPDATE exchange.users
    SET dorado_funds = CASE
      WHEN $2 = 'add' THEN COALESCE(dorado_funds, 0) + $1
      WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
      WHEN $2 = 'edit' THEN $1
    END
    WHERE id = $3
  `;
  const values = [amount, mode, user_id];
  return await query(sql, values, executor);
}
