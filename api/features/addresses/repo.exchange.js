// Addresses read from the legacy exchange schema.
//
// See repo.js for how this and repo.next.ts are selected between.
import query from "#shared/db/query.js";

// The columns are listed rather than selected with *, so that a column added to
// exchange.addresses shows up as a difference against repo.next.ts instead of
// silently widening what the API returns. Projecting explicitly is what let the
// products and orders migrations catch drift; a * hides it.
//
// EVERY function here returns the SAME shape, reads and writes alike, and that
// is not tidiness. create, update and setDefault used to end in RETURNING *,
// which hands back exchange's flat row - so the wire adapter, which exists to
// flatten the nested shape, ran flatten() on something already flat, found no
// user_address to lift from, and set name and is_default to NULL. The address
// went into the database correctly and came back to the browser nameless.
//
// The read path was fine, so nothing surfaced it: a refetch showed the right
// label a moment later. The frontend inserts the create response at the top of
// its list optimistically, so what a customer saw was their new address
// appearing blank and then fixing itself.
//
// Found by features/addresses/replay.test.js on its first run, which is exactly
// what an HTTP-level test is for - no repo test can see it, because the damage
// happens in middleware after the repo has returned.
const COLUMNS = `
     id, line_1, line_2, city, state, country, zip,
     created_at, updated_at, phone_number, is_valid,
     country_code, is_residential,
     jsonb_build_object(
       'user_id', user_id,
       'label', name,
       'default_shipping', is_default
     ) AS user_address`;

export async function list(userId) {
  const q = `
    SELECT ${COLUMNS}
    FROM exchange.addresses
    WHERE user_id = $1
    ORDER BY is_default DESC, id ASC;
  `;
  const { rows } = await query(q, [userId]);
  return rows;
}

export async function getFromId(address_id) {
  const q = `
    SELECT ${COLUMNS}
    FROM exchange.addresses
    WHERE id = $1
    ORDER BY is_default DESC, id ASC;
  `;
  const { rows } = await query(q, [address_id]);
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

  const { rows } = await query(q, [addressId, userId]);
  return rows[0]?.locked === true;
}

export async function create({ address, userId }, executor) {
  const q = `
    INSERT INTO exchange.addresses (
      user_id, line_1, line_2, city, state, country, zip, name,
      is_default, phone_number, is_valid, country_code, is_residential
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING ${COLUMNS};
  `;

  const values = [
    userId,
    address.line_1,
    address.line_2,
    address.city,
    address.state,
    address.country,
    address.zip,
    address.user_address?.label,
    address.user_address?.default_shipping,
    address.phone_number,
    true,
    address.country_code,
    false,
  ];

  const { rows } = await query(q, values, executor);
  return rows[0];
}

export async function update({ address, userId }, executor) {
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
    RETURNING ${COLUMNS};
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
    address.user_address?.label,
    address.user_address?.default_shipping,
    address.phone_number,
    address.country_code,
    false,
  ];

  const { rows } = await query(q, values, executor);
  return rows[0];
}

export async function updateValidation({ addressId, is_valid, is_residential }, executor) {
  const q = `
    UPDATE exchange.addresses
    SET is_valid = $1, is_residential = $2
    WHERE id = $3
    RETURNING ${COLUMNS};
  `;
  const { rows } = await query(q, [is_valid, is_residential, addressId], executor);
  return rows[0];
}

export async function remove({ addressId, userId }, executor) {
  const q = `
    DELETE FROM exchange.addresses
    WHERE id = $1 AND user_id = $2;
  `;
  await query(q, [addressId, userId], executor);
  return true;
}

export async function setDefault({ userId, addressId }, executor) {
  const q = `
    UPDATE exchange.addresses
    SET is_default = CASE WHEN id = $2 THEN TRUE ELSE FALSE END
    WHERE user_id = $1;
  `;
  await query(q, [userId, addressId], executor);
  return true;
}
