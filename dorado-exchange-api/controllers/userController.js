const pool = require("../db"); // Database connection

const getAddresses = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id in request" });
    }

    const { rows } = await pool.query(
      `SELECT * FROM exchange.addresses WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const createAndUpdateAddress = async (req, res) => {
  const address_id = req.body.address_id;
  const user_id = req.body.user_id;
  const address = req.body.address
  const creating_new = req.body.creating_new;

  let query;
  let values;

  try {
    if (!user_id) {
      return res.status(400).json({ error: "Missing required fields in request" });
    }
    
    if (!creating_new && !address_id) {
      return res.status(400).json({ error: "Missing required fields in request" });
    }
    if (creating_new) {
      query = `
        INSERT INTO exchange.addresses (
          user_id, line_1, line_2, city, state, country, zip, is_default, name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *`;
      values = [
        user_id,
        address.line_1,
        address.line_2,
        address.city,
        address.state,
        address.country,
        address.zip,
        address.is_default || false,
        address.name,
      ];
    } else {
      query = `
        UPDATE exchange.addresses
        SET line_1 = $1, line_2 = $2, city = $3, state = $4, country = $5, zip = $6, 
            is_default = $7, name = $8, updated_at = NOW()
        WHERE id = $9 AND user_id = $10
        RETURNING *`;
      values = [
        address.line_1,
        address.line_2,
        address.city,
        address.state,
        address.country,
        address.zip,
        address.is_default || false,
        address.name,
        address_id,
        user_id,
      ];
    }

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Address not found or not updated" });
    }

    if (address.is_default) {
      await pool.query(
        `UPDATE exchange.addresses SET is_default = FALSE WHERE user_id = $1 AND id != $2`,
        [user_id, rows[0].id]
      );
    }

    res.status(address_id ? 200 : 201).json(rows[0]);
  } catch (error) {
    console.error("Error creating/updating address:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { user_id, id } = req.body;

    if (!user_id || !id) {
      return res.status(400).json({ error: "Missing user_id or address ID" });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM exchange.addresses WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, user_id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Address not found or not authorized" });
    }

    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const { user_id, id } = req.body;

    if (!user_id || !id) {
      return res.status(400).json({ error: "Missing user_id or address ID" });
    }

    // Remove previous default
    await pool.query(
      `UPDATE exchange.addresses SET is_default = FALSE WHERE user_id = $1`,
      [user_id]
    );

    // Set new default
    const { rows } = await pool.query(
      `UPDATE exchange.addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Address not found or not authorized" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error setting default address:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAddresses,
  createAndUpdateAddress,
  deleteAddress,
  setDefaultAddress,
};
