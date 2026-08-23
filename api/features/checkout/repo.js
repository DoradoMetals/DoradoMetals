import { PRODUCT_FIELDS, PRODUCT_FIELDS_WITH_ALIAS } from "#features/products/constants.js";
import query from "#shared/db/query.js";

export async function getCart(user_id) {
  const sql = `
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
  const result = await query(sql, values);
  return result.rows;
}

// Returns the user's cart id, creating the cart if they do not have one.
// ON CONFLICT DO NOTHING returns no row when the cart already exists, so the
// existing id is read back. Mirrors ensureSellCart below.
export async function ensureCart(user_id, client) {
  const insertRes = await query(
    `
    INSERT INTO exchange.carts (id, user_id)
    VALUES (gen_random_uuid(), $1)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id
    `,
    [user_id],
    client
  );

  if (insertRes.rows.length > 0) return insertRes.rows[0].id;

  const selectRes = await query(
    `SELECT id FROM exchange.carts WHERE user_id = $1`,
    [user_id],
    client
  );
  return selectRes.rows[0]?.id;
}

export async function clearCart(cart_id, client) {
  const sql = `DELETE FROM exchange.cart_items WHERE cart_id = $1`;
  const values = [cart_id];
  return await query(sql, values, client);
}

export async function addItems(items, cart_id, client) {
  if (items.length === 0) return;

  const productIds = items.map((item) => item.id);
  const quantities = items.map((item) => item.quantity);

  const sql = `
    INSERT INTO exchange.cart_items (id, cart_id, product_id, quantity)
    SELECT
      gen_random_uuid(),
      $1::uuid,
      u.product_id,
      u.quantity
    FROM UNNEST($2::uuid[], $3::int[]) AS u(product_id, quantity)
    `;
  const values = [cart_id, productIds, quantities];
  return await query(sql, values, client);
}

export async function getSellCartId(user_id) {
  const result = await query(
    `SELECT id FROM exchange.sell_carts WHERE user_id = $1`,
    [user_id]
  );
  return result.rows[0]?.id ?? null;
}

export async function ensureSellCart(user_id, client) {
  const insertRes = await query(
    `
    INSERT INTO exchange.sell_carts (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id
    `,
    [user_id]
  , client);

  if (insertRes.rows.length > 0) return insertRes.rows[0].id;

  const selectRes = await query(
    `SELECT id FROM exchange.sell_carts WHERE user_id = $1`,
    [user_id]
  , client);
  return selectRes.rows[0]?.id;
}

export async function clearSellCartItems(cart_id, client) {
  return await query(
    `DELETE FROM exchange.sell_cart_items WHERE cart_id = $1`,
    [cart_id]
  , client);
}

export async function getSellCartScrapItems(cart_id) {
  const scrapQuery = `
    SELECT
      sci.id AS cart_item_id,
      sci.scrap_id,
      sci.quantity,
      s.*,
      metal.type AS metal
    FROM exchange.sell_cart_items sci
    LEFT JOIN exchange.scrap s ON sci.scrap_id = s.id
    LEFT JOIN exchange.metals metal ON metal.id = s.metal_id
    WHERE sci.cart_id = $1 AND sci.scrap_id IS NOT NULL
  `;
  const result = await query(scrapQuery, [cart_id]);
  return result.rows;
}

export async function getSellCartProductItems(cart_id) {
  const productQuery = `
    SELECT
      sci.id AS cart_item_id,
      sci.product_id,
      sci.quantity,
      ${PRODUCT_FIELDS_WITH_ALIAS},
      metal.type AS metal_type
    FROM exchange.sell_cart_items sci
    LEFT JOIN exchange.products p ON sci.product_id = p.id
    LEFT JOIN exchange.metals metal ON metal.id = p.metal_id
    WHERE sci.cart_id = $1 AND sci.product_id IS NOT NULL
  `;
  const result = await query(productQuery, [cart_id]);
  return result.rows;
}

export async function findProductIdByName(product_name, client) {
  const result = await query(
    `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
    [product_name]
  , client);
  return result.rows[0]?.id ?? null;
}

export async function addSellCartProductItem(
  cart_id,
  product_id,
  quantity,
  client
) {
  return await query(
    `INSERT INTO exchange.sell_cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)`,
    [cart_id, product_id, quantity]
  , client);
}

export async function addSellCartScrapItem(
  cart_id,
  scrap_id,
  quantity,
  client
) {
  return await query(
    `INSERT INTO exchange.sell_cart_items (cart_id, scrap_id, quantity) VALUES ($1, $2, $3)`,
    [cart_id, scrap_id, quantity]
  , client);
}

export async function scrapExists(scrap_id, client) {
  const result = await query(
    `SELECT id FROM exchange.scrap WHERE id = $1`,
    [scrap_id]
  , client);
  return result.rows.length > 0;
}

export async function insertScrapFromCartItem(scrap_id, cartItemData, client) {
  return await query(
    `
    INSERT INTO exchange.scrap (
      id, metal_id, gem_id, pre_melt, purity, content, gross_unit, bid_premium
    )
    VALUES (
      $1,
      (SELECT id FROM exchange.metals WHERE LOWER(type) = LOWER($2)),
      $3, $4, $5, $6, $7, $8
    )
    `,
    [
      scrap_id,
      cartItemData?.metal,
      cartItemData?.gem_id,
      cartItemData?.pre_melt,
      cartItemData?.purity,
      cartItemData?.content,
      cartItemData?.gross_unit,
      cartItemData?.bid_premium,
    ]
  , client);
}

export async function deleteOrphanScrap(client) {
  return await query(
    `
    DELETE FROM exchange.scrap
    WHERE id NOT IN (
      SELECT scrap_id FROM exchange.sell_cart_items WHERE scrap_id IS NOT NULL
      UNION
      SELECT scrap_id FROM exchange.purchase_order_items WHERE scrap_id IS NOT NULL
    )
    `,
    [],
    client
  );
}
