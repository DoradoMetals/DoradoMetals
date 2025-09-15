import { PRODUCT_FIELDS } from "../constants/productsConstants.js";
import pool from "../db.js";

export async function getCart(user_id) {
  const query = `
    SELECT 
      ci.id AS cart_item_id, 
      ci.product_id, 
      ci.quantity, 
      p.${PRODUCT_FIELDS}, 
      metal.type AS metal_type, 
      mint.name AS mint_name
    FROM exchange.cart_items ci
    LEFT JOIN exchange.products p ON ci.product_id = p.id
    LEFT JOIN exchange.metals metal ON metal.id = p.metal_id
    LEFT JOIN exchange.mints mint ON mint.id = p.mint_id
    WHERE ci.cart_id = (
      SELECT id FROM exchange.carts WHERE user_id = $1
    );
  `;
  const values = [user_id];
  const result = pool.query(query, values);
  return result.rows;
}

export async function createNew(user_id, client) {
  const query = `
    INSERT INTO exchange.carts (id, user_id)
    VALUES (gen_random_uuid(), $1)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id
  `;
  const values = [user_id];
  const result = client.query(query, values);
  return result.rows[0];
}

export async function getCartId(user_id, client) {
  const query = `SELECT id FROM exchange.carts WHERE user_id = $1`;
  const values = [user_id];
  const result = await client.query(query, values);
  return result.rows[0];
}

export async function clearCart(cart_id, client) {
  const query = `DELETE FROM exchange.cart_items WHERE cart_id = $1`;
  const values = [cart_id];
  return await client.query(query, values);
}

export async function addItems(items, cart_id, client) {
  if (items.length === 0) return;

  const productIds = items.map((item) => item.id);
  const quantities = items.map((item) => item.quantity);

  const query = `
    INSERT INTO exchange.cart_items (id, cart_id, product_id, quantity)
    SELECT
      gen_random_uuid(),
      $1::uuid,
      u.product_id,
      u.quantity
    FROM UNNEST($2::uuid[], $3::int[]) AS u(product_id, quantity)
    `;
  const values = [cart_id, productIds, quantities];
  return await client.query(query, values);
}
