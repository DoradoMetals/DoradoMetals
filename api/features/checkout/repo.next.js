// The checkout session, against the checkout schema.
//
// Two differences from exchange, both deliberate:
//
//   the two directions are one table. exchange has carts and sell_carts, each
//   UNIQUE (user_id); checkout.checkouts has one row per (user_id, direction),
//   taking the same values orders.orders uses - 'sale' for buying from us,
//   'purchase' for selling to us - so a checkout and the order it becomes agree.
//
//   scrap and bullion are one table. exchange puts a piece of scrap in
//   exchange.scrap and points a sell_cart_item at it; here the values sit on
//   checkout.items and `bullion_id IS NULL` is what makes a line scrap. That is
//   the same shape orders.items and refiners.items use.
//
// So there is no scrap row to create, no scrapExists to check and no orphan
// scrap to sweep. A line is its own record.
//
// A checkout session starts empty and is filled in as the customer moves
// through it - Jacob: "adding something to the cart as a checkout session...
// the other values being null. They just can't be null when the checkout
// session is converted to an order." That last part is a rule for the
// conversion, not a constraint here, because the row legitimately starts bare.
import query from "#shared/db/query.js";

const SALE = "sale";
const PURCHASE = "purchase";

// One checkout per user per direction, created on first use. 068 added the
// unique index this upserts on.
async function ensureCheckout(user_id, direction, client) {
  const inserted = await query(
    `INSERT INTO checkout.checkouts (user_id, direction)
     VALUES ($1, $2)
     ON CONFLICT (user_id, direction) DO NOTHING
     RETURNING id`,
    [user_id, direction],
    client
  );
  if (inserted.rows.length > 0) return inserted.rows[0].id;

  const existing = await query(
    `SELECT id FROM checkout.checkouts WHERE user_id = $1 AND direction = $2`,
    [user_id, direction],
    client
  );
  return existing.rows[0]?.id;
}

export const ensureCart = (user_id, client) => ensureCheckout(user_id, SALE, client);
export const ensureSellCart = (user_id, client) => ensureCheckout(user_id, PURCHASE, client);

export async function getSellCartId(user_id) {
  const { rows } = await query(
    `SELECT id FROM checkout.checkouts WHERE user_id = $1 AND direction = $2`,
    [user_id, PURCHASE]
  );
  return rows[0]?.id ?? null;
}

// The buy cart. Column names are aliased back to what exchange returns:
// products.bullion calls three of them name/description/type.
export async function getCart(user_id) {
  const { rows } = await query(
    `SELECT
       ci.id AS cart_item_id,
       ci.bullion_id AS product_id,
       ci.quantity,
       b.id, b.name AS product_name, b.description AS product_description,
       b.type AS product_type, b.gross, b.purity, b.content, b.slug,
       b.bid_premium, b.ask_premium, b.image_front, b.image_back,
       b.shadow_offset, b.variant_group, b.variant_label,
       b.is_generic, b.legal_tender, b.domestic_tender, b.sell_display,
       metal.name AS metal_type,
       mint.name AS mint_name
     FROM checkout.items ci
     JOIN checkout.checkouts c ON c.id = ci.checkout_id
     LEFT JOIN products.bullion b ON b.id = ci.bullion_id
     LEFT JOIN metals.metals metal ON metal.id = b.metal_id
     LEFT JOIN products.mints mint ON mint.id = b.mint_id
     WHERE c.user_id = $1 AND c.direction = $2
     ORDER BY ci.id`,
    [user_id, SALE]
  );
  return rows;
}

// A scrap line is one with no bullion. Its values are on the item itself, so
// `scrap_id` is the item's own id - there is no second row to point at.
export async function getSellCartScrapItems(checkout_id) {
  const { rows } = await query(
    `SELECT
       ci.id AS cart_item_id,
       ci.id AS scrap_id,
       ci.id,
       ci.quantity,
       ci.pre_melt,
       ci.post_melt,
       ci.purity,
       ci.content,
       ci.unit AS gross_unit,
       ci.premium AS bid_premium,
       metal.name AS metal
     FROM checkout.items ci
     LEFT JOIN metals.metals metal ON metal.id = ci.metal_id
     WHERE ci.checkout_id = $1 AND ci.bullion_id IS NULL
     ORDER BY ci.id`,
    [checkout_id]
  );
  return rows;
}

export async function getSellCartProductItems(checkout_id) {
  const { rows } = await query(
    `SELECT
       ci.id AS cart_item_id,
       ci.bullion_id AS product_id,
       ci.quantity,
       b.id, b.name AS product_name, b.description AS product_description,
       b.type AS product_type, b.gross, b.purity, b.content, b.slug,
       b.bid_premium, b.ask_premium, b.image_front, b.image_back,
       b.shadow_offset, b.variant_group, b.variant_label,
       metal.name AS metal_type
     FROM checkout.items ci
     LEFT JOIN products.bullion b ON b.id = ci.bullion_id
     LEFT JOIN metals.metals metal ON metal.id = b.metal_id
     WHERE ci.checkout_id = $1 AND ci.bullion_id IS NOT NULL
     ORDER BY ci.id`,
    [checkout_id]
  );
  return rows;
}

export async function findProductIdByName(product_name, client) {
  const { rows } = await query(
    `SELECT id FROM products.bullion WHERE name = $1 LIMIT 1`,
    [product_name],
    client
  );
  return rows[0]?.id ?? null;
}

async function clearItems(checkout_id, client) {
  return await query(
    `DELETE FROM checkout.items WHERE checkout_id = $1`,
    [checkout_id],
    client
  );
}

export const clearCart = clearItems;
export const clearSellCartItems = clearItems;

export async function addItems(items, checkout_id, client) {
  if (!items || items.length === 0) return;

  return await query(
    `INSERT INTO checkout.items (checkout_id, bullion_id, metal_id, quantity, premium)
     SELECT $1::uuid, u.bullion_id, b.metal_id, u.quantity, b.bid_premium
     FROM UNNEST($2::uuid[], $3::numeric[]) AS u(bullion_id, quantity)
     JOIN products.bullion b ON b.id = u.bullion_id`,
    [checkout_id, items.map((i) => i.id), items.map((i) => i.quantity)],
    client
  );
}

export async function replaceCart(user_id, items, client) {
  const checkout_id = await ensureCart(user_id, client);
  await clearItems(checkout_id, client);
  await addItems(items, checkout_id, client);
  return checkout_id;
}

// The sell cart. A scrap line carries its own values rather than an id into
// another table, so there is nothing to create first and nothing to sweep after.
export async function replaceSellCart(user_id, cart, client) {
  const checkout_id = await ensureSellCart(user_id, client);
  await clearItems(checkout_id, client);

  for (const item of cart) {
    const quantity = item?.quantity || 1;

    if (item?.type === "product") {
      const productName = item?.product_name;
      if (!productName) continue;

      const bullionId = await findProductIdByName(productName, client);
      if (!bullionId) continue;

      await query(
        `INSERT INTO checkout.items (checkout_id, bullion_id, metal_id, quantity, premium)
         SELECT $1, b.id, b.metal_id, $3, b.bid_premium
         FROM products.bullion b WHERE b.id = $2`,
        [checkout_id, bullionId, quantity],
        client
      );
    }

    if (item?.type === "scrap") {
      const d = item?.data ?? {};
      if (!d.id) continue;

      await query(
        `INSERT INTO checkout.items (
           checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
           content, unit, premium, quantity
         )
         VALUES (
           $1, NULL,
           (SELECT id FROM metals.metals WHERE lower(name) = lower($2)),
           $3, $4, $5, $6, $7, $8, $9
         )`,
        [checkout_id, d.metal, d.pre_melt, d.post_melt, d.purity,
         d.content, d.gross_unit, d.bid_premium, quantity],
        client
      );
    }
  }

  return checkout_id;
}
