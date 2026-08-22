// Addresses read from the places schema.
//
// An address splits in two here, and the split is the point of it. A postal
// address has no owner - places.addresses is just somewhere on earth - and a
// person's relationship to one is places.user_addresses: their label for it,
// and whether it is their default. That is what lets an order snapshot an
// address without copying whose it was, and lets two people share a building.
//
// exchange's single is_default became default_shipping and default_billing,
// because where you want a parcel and where your card is registered are not the
// same fact. exchange has one flag, so both are read and written together here;
// telling them apart is a product change, not a migration one.
//
// The exchange shape is reassembled exactly, because callers depend on it -
// getFromId in particular, which is what resolves the address_id an order
// returns.
import query from "#shared/db/query.js";

// The columns exchange.addresses had, from the two tables now holding them.
const ADDRESS_COLUMNS = `
      a.id,
      ua.user_id,
      a.line_1,
      a.line_2,
      a.city,
      a.state,
      a.country,
      a.zip,
      a.created_at,
      a.updated_at,
      ua.label AS name,
      ua.default_shipping AS is_default,
      a.phone_number,
      a.is_valid,
      a.country_code,
      a.is_residential`;

// Inner join: an address with no user_addresses row is a snapshot taken for an
// order, not something in anyone's address book, and exchange's list would
// never have returned it.
const FROM = `
    FROM places.addresses a
    JOIN places.user_addresses ua ON ua.address_id = a.id`;

export async function list(userId) {
  const { rows } = await query(
    `SELECT ${ADDRESS_COLUMNS} ${FROM}
     WHERE ua.user_id = $1
     ORDER BY ua.default_shipping DESC, a.id ASC;`,
    [userId]
  );
  return rows;
}

export async function getFromId(address_id) {
  const { rows } = await query(
    `SELECT ${ADDRESS_COLUMNS} ${FROM}
     WHERE a.id = $1
     ORDER BY ua.default_shipping DESC, a.id ASC;`,
    [address_id]
  );
  return rows;
}

// Whether an address is in use by an order that has not finished, which is what
// stops it being edited or deleted underneath one.
//
// The order no longer carries the address id - orders.addresses does, and it
// records both the snapshot and the address book row it came from. Matching on
// source_address_id is what keeps this asking the same question exchange asked.
export async function isActive({ addressId, userId }) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM orders.orders o
       JOIN orders.addresses oa ON oa.order_id = o.id
       WHERE oa.source_address_id = $1
         AND o.user_id = $2
         AND o.status IS DISTINCT FROM 'Completed'
     ) AS locked;`,
    [addressId, userId]
  );
  return rows[0]?.locked === true;
}

// ---------------------------------------------------------------- mirroring
//
// Server-side, from exchange, joining the caller's transaction. Both halves of
// the split are kept in step: the postal address and the person's link to it.

export async function mirrorAddress(addressId, executor) {
  await query(
    `INSERT INTO places.addresses (
       id, line_1, line_2, city, state, country, zip,
       country_code, phone_number, created_at, updated_at, is_valid, is_residential
     )
     SELECT
       e.id, e.line_1, e.line_2, e.city, e.state, e.country, e.zip,
       e.country_code, e.phone_number, e.created_at, e.updated_at,
       e.is_valid, coalesce(e.is_residential, false)
     FROM exchange.addresses e
     WHERE e.id = $1
     ON CONFLICT (id) DO UPDATE SET
       line_1 = EXCLUDED.line_1, line_2 = EXCLUDED.line_2, city = EXCLUDED.city,
       state = EXCLUDED.state, country = EXCLUDED.country, zip = EXCLUDED.zip,
       country_code = EXCLUDED.country_code,
       phone_number = EXCLUDED.phone_number,
       updated_at = EXCLUDED.updated_at, is_valid = EXCLUDED.is_valid,
       is_residential = EXCLUDED.is_residential`,
    [addressId],
    executor
  );

  // exchange has one is_default, so both defaults follow it. Splitting them
  // apart needs a product decision and a UI, not a mirror.
  //
  // The conflict is on (user_id, address_id), not address_id: the unique index
  // is deliberately on the pair, because two people sharing an address is
  // exactly what splitting the address from the person makes possible.
  await query(
    `INSERT INTO places.user_addresses (
       address_id, user_id, label, default_shipping, default_billing
     )
     SELECT e.id, e.user_id, e.name,
            coalesce(e.is_default, false), coalesce(e.is_default, false)
     FROM exchange.addresses e
     WHERE e.id = $1 AND e.user_id IS NOT NULL
     ON CONFLICT (user_id, address_id) DO UPDATE SET
       label = EXCLUDED.label,
       default_shipping = EXCLUDED.default_shipping,
       default_billing = EXCLUDED.default_billing`,
    [addressId],
    executor
  );
}

// Every address a user owns, for the writes that change one flag across all of
// them - setDefault turns one on and the rest off in a single statement.
export async function mirrorUserAddresses(userId, executor) {
  const { rows } = await query(
    `SELECT id FROM exchange.addresses WHERE user_id = $1`,
    [userId],
    executor
  );
  for (const r of rows) await mirrorAddress(r.id, executor);
}

// Removes what exchange no longer has. The link goes first: places.addresses
// may still be referenced by an order snapshot, and an address that is gone
// from someone's book has not stopped being the place a parcel was sent.
export async function removeAddress(addressId, executor) {
  await query(
    `DELETE FROM places.user_addresses ua
     WHERE ua.address_id = $1
       AND NOT EXISTS (SELECT 1 FROM exchange.addresses e WHERE e.id = ua.address_id)`,
    [addressId],
    executor
  );

  await query(
    `DELETE FROM places.addresses a
     WHERE a.id = $1
       AND NOT EXISTS (SELECT 1 FROM exchange.addresses e WHERE e.id = a.id)
       AND NOT EXISTS (SELECT 1 FROM orders.addresses oa WHERE oa.source_address_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM orders.addresses oa WHERE oa.address_id = a.id)`,
    [addressId],
    executor
  );
}
