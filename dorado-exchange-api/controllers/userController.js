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

    const query = 
    `
      INSERT INTO exchange.addresses (id, user_id, line_1, line_2, city, state, country, zip, name, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET 
        line_1 = EXCLUDED.line_1,
        line_2 = EXCLUDED.line_2,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        zip = EXCLUDED.zip,
        name = EXCLUDED.name,
        is_default = EXCLUDED.is_default;
    `
    const values = [
      address.id,
      user_id,
      address.line_1,
      address.line_2,
      address.city,
      address.state,
      address.country,
      address.zip,
      address.name,
      address.is_default,
    ];

    const rows = await pool.query(query, values);

    if (address.is_default === true) {
      await pool.query("UPDATE exchange.addresses SET is_default = FALSE WHERE user_id = $1 AND id != $2", [user_id, address.id]);
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error creating/updating address:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteAddress = async (req, res) => {
  const user_id = req.body.user_id;
  const address_id = req.body.address?.id; // Get the address ID

  try {
    if (!user_id || !address_id) {
      return res.status(400).json({ error: "Missing required fields in request" });
    }

    const client = await pool.connect(); // Get a database client for transaction

    try {
      await client.query("BEGIN"); // Start transaction

      // Check if the address is default
      const { rows } = await client.query(
        `SELECT is_default FROM exchange.addresses WHERE id = $1 AND user_id = $2`,
        [address_id, user_id]
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK"); // Rollback if address doesn't exist
        return res.status(404).json({ error: "Address not found" });
      }

      if (rows[0].is_default === true) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cannot delete default address" });
      }

      // Delete the address
      await client.query(
        `DELETE FROM exchange.addresses WHERE id = $1 AND user_id = $2`,
        [address_id, user_id]
      );

      await client.query("COMMIT"); // Commit transaction

      res.status(200).json({ message: "Address deleted successfully" });
    } catch (error) {
      await client.query("ROLLBACK"); // Rollback transaction on error
      console.error("Error deleting address:", error);
      res.status(500).json({ error: "Internal Server Error" });
    } finally {
      client.release(); // Release the client back to the pool
    }
  } catch (error) {
    console.error("Error acquiring database client:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


module.exports = {
  getAddresses,
  createAndUpdateAddress,
  deleteAddress,
};
