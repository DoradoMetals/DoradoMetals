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
import type { checkout, products } from "@dorado/contracts";
import type { PoolClient, QueryResult } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// Every bullion column on a sale line comes through a LEFT JOIN, so a line
// whose product has since been deleted returns nulls rather than disappearing -
// exactly as exchange's does. The mapped type says that once instead of
// repeating `| null` twenty times.
type Nullable<T> = { [K in keyof T]: T[K] | null };

// The bullion columns a sale line carries. Three are aliased, because
// products.bullion calls them name/description/type and the wire has always
// called them product_name/product_description/product_type.
type SaleBullion = Nullable<
  Pick<
    products.BullionRow,
    | "id"
    | "gross"
    | "purity"
    | "content"
    | "slug"
    | "bid_premium"
    | "ask_premium"
    | "image_front"
    | "image_back"
    | "shadow_offset"
    | "variant_group"
    | "variant_label"
    | "is_generic"
    | "legal_tender"
    | "domestic_tender"
    | "sell_display"
  >
> & {
  product_name: string | null;
  product_description: string | null;
  product_type: string | null;
};

export type SaleItemRow = SaleBullion & {
  cart_item_id: checkout.ItemsRow["id"];
  product_id: checkout.ItemsRow["bullion_id"];
  quantity: checkout.ItemsRow["quantity"];
  metal_type: string | null;
  mint_name: string | null;
};

// A SELL cart's product line: the same idea with a smaller column list and no
// mint. Narrowed rather than reused, so adding a column to one does not
// silently claim the other returns it too.
export type PurchaseProductRow = Nullable<
  Pick<
    products.BullionRow,
    | "id"
    | "gross"
    | "purity"
    | "content"
    | "slug"
    | "bid_premium"
    | "ask_premium"
    | "image_front"
    | "image_back"
    | "shadow_offset"
    | "variant_group"
    | "variant_label"
  >
> & {
  cart_item_id: checkout.ItemsRow["id"];
  product_id: checkout.ItemsRow["bullion_id"];
  quantity: checkout.ItemsRow["quantity"];
  product_name: string | null;
  product_description: string | null;
  product_type: string | null;
  metal_type: string | null;
};

// A SCRAP line. `scrap_id` and `id` are BOTH the item's own id: exchange points
// a cart item at a row in exchange.scrap, and here the values live on the line
// itself, so there is no second row to reference. Two aliases of one column is
// what keeps the wire shape identical.
export type PurchaseScrapRow = Pick<
  checkout.ItemsRow,
  "id" | "quantity" | "pre_melt" | "post_melt" | "purity" | "content"
> & {
  cart_item_id: checkout.ItemsRow["id"];
  scrap_id: checkout.ItemsRow["id"];
  gross_unit: checkout.ItemsRow["unit"];
  bid_premium: checkout.ItemsRow["premium"];
  metal: string | null;
};

// What a caller adds to a buy cart. This arrives as req.body.
export type SaleItemsInput = { id: string; quantity: number };

// What a caller replaces a sell cart with. A line is either a named product or
// a piece of scrap carrying its own values; the two are told apart by `type`,
// and anything else is skipped rather than rejected.
export type PurchaseItemsInput = {
  type?: string;
  quantity?: number;
  product_name?: string;
  data?: {
    id?: string;
    // A product line's data is the catalogue product; only the fields the
    // sync reads are declared. Both name spellings accepted - see D73 below.
    name?: string;
    product_name?: string;
    quantity?: number;
    metal?: string;
    pre_melt?: number | null;
    post_melt?: number | null;
    purity?: number | null;
    content?: number | null;
    gross_unit?: string | null;
    bid_premium?: number | null;
  };
};

type CheckoutId = checkout.CheckoutsRow["id"];

const SALE = "sale";
const PURCHASE = "purchase";
export type Direction = typeof SALE | typeof PURCHASE;

// One checkout per user per direction, created on first use. 068 added the
// unique index this upserts on.
async function ensureCheckout(
  user_id: string,
  direction: string,
  client?: Executor
): Promise<CheckoutId | undefined> {
  const inserted = await query<{ id: CheckoutId }>(
    `INSERT INTO checkout.checkouts (user_id, direction)
     VALUES ($1, $2)
     ON CONFLICT (user_id, direction) DO NOTHING
     RETURNING id`,
    [user_id, direction],
    client
  );
  if (inserted.rows.length > 0) return inserted.rows[0].id;

  const existing = await query<{ id: CheckoutId }>(
    `SELECT id FROM checkout.checkouts WHERE user_id = $1 AND direction = $2`,
    [user_id, direction],
    client
  );
  return existing.rows[0]?.id;
}

// THERE IS NO CART AND NO SELL CART. A checkout session has a direction, and
// the direction is a parameter - Jacob: "It's being replaced by checkout.items
// with a direction." The Cart/SellCart-named wrappers this file used to export
// were the legacy divide living on inside the new write path, which is exactly
// what the one-table design exists to remove.

// Returns null for a user who has never started one - ensureCheckout is what
// creates it.
export async function getCheckoutId(
  user_id: string, direction: Direction
): Promise<CheckoutId | null> {
  const { rows } = await query<{ id: CheckoutId }>(
    `SELECT id FROM checkout.checkouts WHERE user_id = $1 AND direction = $2`,
    [user_id, direction]
  );
  return rows[0]?.id ?? null;
}

// The sale direction. Column names are aliased back to what exchange returns:
// products.bullion calls three of them name/description/type.
export async function getSaleItems(user_id: string): Promise<SaleItemRow[]> {
  const { rows } = await query<SaleItemRow>(
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
export async function getPurchaseScrapItems(
  checkout_id: CheckoutId
): Promise<PurchaseScrapRow[]> {
  const { rows } = await query<PurchaseScrapRow>(
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

export async function getPurchaseProductItems(
  checkout_id: CheckoutId
): Promise<PurchaseProductRow[]> {
  const { rows } = await query<PurchaseProductRow>(
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

// INTERNAL. Not exported, and that is the point: this function was the handle
// features/quotes/service.ts grabbed when it imported this file directly,
// around the repo.js that CHECKOUT_SOURCE selects (D142). The quote surface
// asks features/products for a product by name now - the feature that owns the
// table - and nothing outside this file has ever needed it. Un-exporting is
// what stops the same reach happening again.
async function findProductIdByName(
  product_name: string,
  client?: Executor
): Promise<products.BullionRow["id"] | null> {
  const { rows } = await query<Pick<products.BullionRow, "id">>(
    `SELECT id FROM products.bullion WHERE name = $1 LIMIT 1`,
    [product_name],
    client
  );
  return rows[0]?.id ?? null;
}

// TAKES `CheckoutId | undefined`, and that is the honest type rather than a
// weakened one. ensureCheckout ends in `rows[0]?.id` in BOTH implementations,
// so it can in principle return undefined - the INSERT conflicts and the row
// is gone before the follow-up SELECT - and replaceCart has always passed the
// result straight here without checking. The compiler found that; it is not
// new.
//
// Nothing is lost when it happens: this DELETE matches no rows, and the
// addItems that follows dies on checkout.items.checkout_id being NOT NULL.
// Loud and safe. Guarding here instead would change behaviour repo.exchange.js
// does not have, and repo.dual switches between the two.
async function clearItems(
  checkout_id: CheckoutId | undefined,
  client?: Executor
): Promise<QueryResult> {
  return await query(
    `DELETE FROM checkout.items WHERE checkout_id = $1`,
    [checkout_id],
    client
  );
}

// Returns undefined for an empty list rather than an empty QueryResult, which
// is what repo.exchange.js does too - the callers only await it.
export async function addItems(
  items: SaleItemsInput[] | null | undefined,
  checkout_id: CheckoutId | undefined,
  client?: Executor
): Promise<QueryResult | undefined> {
  if (!items || items.length === 0) return;

  return await query(
    // NO PREMIUM IS WRITTEN HERE. This used to take b.bid_premium off the
    // product, which is the same mistake 085 removed from order items: a
    // premium is a rate, banded on the metal total across the whole checkout,
    // and it is resolved when the checkout becomes an order. A cart line has no
    // premium of its own.
    `INSERT INTO checkout.items (checkout_id, bullion_id, metal_id, quantity)
     SELECT $1::uuid, u.bullion_id, b.metal_id, u.quantity
     FROM UNNEST($2::uuid[], $3::numeric[]) AS u(bullion_id, quantity)
     JOIN products.bullion b ON b.id = u.bullion_id`,
    [checkout_id, items.map((i) => i.id), items.map((i) => i.quantity)],
    client
  );
}

export async function replaceItems(
  user_id: string,
  items: SaleItemsInput[],
  client?: Executor
): Promise<CheckoutId | undefined> {
  const checkout_id = await ensureCheckout(user_id, SALE, client);
  await clearItems(checkout_id, client);
  await addItems(items, checkout_id, client);
  return checkout_id;
}

// The purchase direction. A scrap line carries its own values rather than an id
// into another table, so there is nothing to create first and nothing to sweep
// after.
export async function replaceSellItems(
  user_id: string,
  cart: PurchaseItemsInput[],
  client?: Executor
): Promise<CheckoutId | undefined> {
  const checkout_id = await ensureCheckout(user_id, PURCHASE, client);
  await clearItems(checkout_id, client);

  for (const item of cart) {
    // Quantity rides on the line's data in the frontend's shape; top-level
    // kept first for the declared input type.
    const quantity = item?.quantity ?? item?.data?.quantity ?? 1;

    if (item?.type === "product") {
      // THE LINE THE FRONTEND ACTUALLY SENDS IS { type, data: {...} }. The
      // top-level product_name this read - and only that - meant every
      // product line in a synced sell cart was SKIPPED, silently, by the
      // `continue` below (D73). The scrap branch always read item.data, which
      // is why scrap synced and products vanished. Both spellings of the name
      // are accepted while deployed frontends straddle the products rename.
      const productName =
        item?.product_name ?? item?.data?.name ?? item?.data?.product_name;
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
