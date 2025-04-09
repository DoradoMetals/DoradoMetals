const pool = require("../../db");

const getUser = async (req, res) => {
  const { user_id } = req.query;
  console.log(user_id)
  try {
    const query = 
    `
      SELECT curr_user.id, curr_user.email, curr_user.name, curr_user."createdAt" AS created_at, curr_user."updatedAt" AS updated_at, curr_user."emailVerified" AS email_verified, curr_user.image, curr_user.role
      FROM exchange.users curr_user
      WHERE id = $1
    `;
    const values = [user_id]
    const result = await pool.query(query, values);
    console.log(result.rows)
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getUser,
};
