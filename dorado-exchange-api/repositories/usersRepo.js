const pool = require("../db");

async function getUser(user_id) {
  const query = `
    SELECT curr_user.id, curr_user.email, curr_user.name, curr_user."createdAt" AS created_at, curr_user."updatedAt" AS updated_at, curr_user."emailVerified" AS email_verified, curr_user.image, curr_user.role
    FROM exchange.users curr_user
    WHERE id = $1
  `;
  const values = [user_id];
  const result = await pool.query(query, values);
  return result.rows;
}

async function getAllUsers() {
  const query = `
      SELECT curr_user.id, curr_user.email, curr_user.name, curr_user."createdAt" AS created_at, curr_user."updatedAt" AS updated_at, curr_user."emailVerified" AS email_verified, curr_user.image, curr_user.role, curr_user.dorado_funds
      FROM exchange.users curr_user
      ORDER BY curr_user.role
    `;
  const values = [];
  const result = await pool.query(query, values);
  return result.rows;
}

async function adjustUserCredit(user_id, mode, amount) {
  const query = `
    UPDATE exchange.users
    SET dorado_funds = CASE
      WHEN $2 = 'add' THEN COALESCE(dorado_funds, 0) + $1
      WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
      WHEN $2 = 'edit' THEN $1
    END
    WHERE id = $3
    `;
  const values = [amount, mode, user_id];
  return await pool.query(query, values);
}

module.exports = {
  getUser,
  getAllUsers,
  adjustUserCredit,
};
