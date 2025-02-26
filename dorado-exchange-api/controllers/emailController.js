const pool = require("../db"); // Import the database connection

// Subscribe a new email
const subscribeEmail = async (req, res) => {
  const { email } = req.body;
  console.log(email)

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const result = await pool.query(
      "INSERT INTO exchange.emails (email) VALUES ($1) RETURNING *",
      [email]
    );

    res.status(201).json({message: {text: "Successfully Subscribed!", color: "success"}, email: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") { // Unique constraint violation
      return res.status(202).json({ message: {text: "Already Subscribed!", color: "warning"} });
    }
    console.error("Database Error:", error);
    res.status(500).json({ message: "Error subscribing." });
  }
};

module.exports = {
  subscribeEmail,
}