const pool = require("../db");
const { validateAddress } = require("./shipping/fedexController");

const getAddresses = async (req, res) => {
  const { user_id } = req.query;

  try {
    const query = `
      SELECT * FROM exchange.addresses WHERE user_id = $1 ORDER BY is_default DESC;
    `;
    const values = [user_id];

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const createAndUpdateAddress = async (req, res) => {
  const address = req.body.address;
  const user_id = req.body.user_id;

  try {
    const query = `
    INSERT INTO exchange.addresses (
      id, user_id, line_1, line_2, city, state, country, zip, name, is_default, phone_number, country_code, is_residential
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id) DO UPDATE SET 
      line_1 = EXCLUDED.line_1,
      line_2 = EXCLUDED.line_2,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      country = EXCLUDED.country,
      zip = EXCLUDED.zip,
      name = EXCLUDED.name,
      is_default = EXCLUDED.is_default,
      phone_number = EXCLUDED.phone_number,
      country_code = EXCLUDED.country_code,
      is_residential = EXCLUDED.is_residential;
  `;

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
      address.phone_number,
      address.country_code,
      false,
    ];

    await pool.query(query, values);

    // Validate address using the reusable FedEx function
    const { is_valid, is_residential } = await validateAddress(address);

    await pool.query(
      `UPDATE exchange.addresses SET is_valid = $1, is_residential = $2 WHERE id = $3`,
      [is_valid, is_residential, address.id]
    );

    res.status(200).json({
      message: "Address created or updated.",
      is_valid,
      is_residential,
    });
  } catch (error) {
    console.error(
      "Error creating/updating address:",
      error?.response?.data || error
    );

    const paramList = error?.response?.data?.errors?.[0]?.parameterList;
    if (paramList) {
      console.dir(paramList, { depth: null });
    }

    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteAddress = async (req, res) => {
  const user_id = req.body.user_id;
  const address = req.body.address;

  try {
    const query = `
      DELETE FROM exchange.addresses
      WHERE id = $1 
      AND user_id = $2;
    `;
    const values = [address.id, user_id];

    await pool.query(query, values);
    res.status(200).json("Deleted address.");
  } catch (error) {
    console.error("Error deleting address", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const setDefaultAddress = async (req, res) => {
  const user_id = req.body.user_id;
  const address = req.body.address;

  try {
    const query = `
      UPDATE exchange.addresses
      SET is_default = CASE 
        WHEN id = $2 THEN TRUE 
        ELSE FALSE 
      END
      WHERE user_id = $1;
    `;
    const values = [user_id, address.id];

    await pool.query(query, values);
    res.status(200).json("Set default address.");
  } catch (error) {
    console.error("Error setting default address", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAddresses,
  createAndUpdateAddress,
  deleteAddress,
  setDefaultAddress,
};
