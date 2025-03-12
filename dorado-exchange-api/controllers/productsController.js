const pool = require("../db"); // Import the database connection

const getAllProducts = async (req, res) => {
  const { metal_type } = req.query; // Use query parameters (GET request)

  try {
    const result = await pool.query(
      `
      SELECT p.*
      FROM exchange.products p
      JOIN exchange.metals m ON p.metal_id = m.id
      WHERE m.type = $1
      ORDER BY p.product_name ASC;
      `,
      [metal_type] // Parameterized query to prevent SQL injection
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getAllProducts,
};
