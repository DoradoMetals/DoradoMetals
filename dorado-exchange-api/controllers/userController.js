const pool = require("../db"); // Import the database connection

const getUserProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.status(200).json(req.user); // Return user data
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getUserAddresses = async (req, res) => {
  const userId = req.user.id; // Use the authenticated user's ID

  try {
    const result = await pool.query(
      "SELECT * FROM exchange.addresses WHERE user_id = $1 ORDER BY created_at DESC;",
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching user addresses:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


module.exports = {
  getUserProfile,
  getUserAddresses,
};