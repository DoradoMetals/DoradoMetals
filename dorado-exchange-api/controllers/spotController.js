const pool = require("../db");

const getSpotPrices = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, type, ask_spot, bid_spot FROM exchange.metals ORDER BY type ASC"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching spot prices:", error);
    res.status(500).json({ error: "Failed to fetch spot prices." });
  }
};

module.exports = {
  getSpotPrices,
};