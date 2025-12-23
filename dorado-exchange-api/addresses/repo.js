import pool from "../db.js";

export async function list(userId) {
  const q = `
    SELECT *
    FROM exchange.addresses
    WHERE user_id = $1
    ORDER BY is_default DESC;
  `;
  const { rows } = await pool.query(q, [userId]);
  return rows;
}

export async function isActive({ addressId, userId }) {
  const q = `
    SELECT EXISTS (
      SELECT 1
      FROM exchange.purchase_orders
      WHERE address_id = $1
        AND user_id = $2
        AND purchase_order_status != 'Completed'
    )
    OR EXISTS (
      SELECT 1
      FROM exchange.sales_orders
      WHERE address_id = $1
        AND user_id = $2
        AND sales_order_status != 'Completed'
    ) AS locked;
  `;

  const { rows } = await pool.query(q, [addressId, userId]);
  return rows[0]?.locked === true;
}

export async function create({ address, userId }) {
  const q = `
    INSERT INTO exchange.addresses (
      user_id, line_1, line_2, city, state, country, zip, name,
      is_default, phone_number, country_code, is_residential
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *;
  `;

  const values = [
    userId,
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

  const { rows } = await pool.query(q, values);
  return rows[0];
}

export async function update({ address, userId }) {
  const q = `
    UPDATE exchange.addresses
    SET
      line_1 = $3,
      line_2 = $4,
      city = $5,
      state = $6,
      country = $7,
      zip = $8,
      name = $9,
      is_default = $10,
      phone_number = $11,
      country_code = $12,
      is_residential = $13
    WHERE id = $1 AND user_id = $2
    RETURNING *;
  `;

  const values = [
    address.id,
    userId,
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

  const { rows } = await pool.query(q, values);
  return rows[0];
}

export async function updateValidation({ addressId, is_valid, is_residential }) {
  const q = `
    UPDATE exchange.addresses
    SET is_valid = $1, is_residential = $2
    WHERE id = $3
    RETURNING *;
  `;
  const { rows } = await pool.query(q, [is_valid, is_residential, addressId]);
  return rows[0];
}

export async function remove({ addressId, userId }) {
  const q = `
    DELETE FROM exchange.addresses
    WHERE id = $1 AND user_id = $2;
  `;
  await pool.query(q, [addressId, userId]);
  return true;
}

export async function setDefault({ userId, addressId }) {
  const q = `
    UPDATE exchange.addresses
    SET is_default = CASE WHEN id = $2 THEN TRUE ELSE FALSE END
    WHERE user_id = $1;
  `;
  await pool.query(q, [userId, addressId]);
  return true;
}
