const pool = require("../db"); // Database connection

const getAddresses = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id in request" });
    }

    const { rows } = await pool.query(
      `SELECT * FROM exchange.addresses WHERE user_id = $1`,
      [user_id]
    );
    console.log(rows)
    res.json(rows);
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const createAndUpdateAddress = async (req, res) => {
  const user_id = req.body.user_id;
  const address = req.body.address;

  try {
    if (!user_id || !address) {
      return res.status(400).json({ error: "Missing required fields in request" });
    }

    console.log(address)

    const query = `
      INSERT INTO exchange.addresses (id, user_id, line_1, line_2, city, state, country, zip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET 
        line_1 = EXCLUDED.line_1,
        line_2 = EXCLUDED.line_2,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        zip = EXCLUDED.zip;`

    const values = [
      address.id,        // ID (should be generated client-side or omitted for new records)
      user_id,           // User ID
      address.line_1,
      address.line_2,
      address.city,
      address.state,
      address.country,
      address.zip,
    ];

    const { rows } = await pool.query(query, values);

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error creating/updating address:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAddresses,
  createAndUpdateAddress,
};
