const pool = require("../db");

const createReview = async (req, res) => {
  const { review, user } = req.body;
  
  try {
      const query = `
      INSERT INTO exchange.reviews (
        user_id, review_text
      )
      VALUES ($1, $2)
      RETURNING *;
    `;

    const values = [user.id, review];

    const result = await pool.query(query, values);

    res.status(200).json({ result });
  } catch (error) {
    console.error("Error saving review:", error?.response?.data || error);

    const paramList = error?.response?.data?.errors?.[0]?.parameterList;
    if (paramList) {
      console.dir(paramList, { depth: null });
    }

    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  createReview,
};
