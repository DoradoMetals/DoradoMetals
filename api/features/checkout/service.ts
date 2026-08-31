import withTransaction from "#shared/db/withTransaction.ts";
import * as cartRepo from "#features/checkout/repo.js";
// The SERVICE, not a repo: products is composed from three reference tables
// now, and liveness is the one question checkout asks of it.
import * as productService from "#features/products/service.ts";
import type {
  SaleItemRow,
  SaleItemsInput,
  PurchaseItemsInput,
  PurchaseScrapRow,
  PurchaseProductRow,
} from "#features/checkout/repo.next.ts";

// NOTE THE FIELD IS `status`, NOT `statusCode`. addresses and users both throw
// a statusCode; this feature has always thrown status. Left as it is rather
// than unified here - errorHandler is what decides which it reads, and changing
// which errors reach a customer is not a typing change.
interface HttpError extends Error {
  status?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = 400;
  return err;
}

export async function getCart(user_id: string): Promise<SaleItemRow[]> {
  return await cartRepo.getCart(user_id);
}

// A CART MAY ONLY HOLD PRODUCTS THAT ARE LIVE IN THAT DIRECTION.
//
// The storefront only ever shows live products, so the frontend never asks for
// a hidden one - but the cart endpoints take a product id from the request body
// and nothing checked it. A caller posting straight to the API could put any
// id in a cart, including the 25 products carrying a zero ask premium, none of
// which is displayed and every one of which would price at nothing.
//
// The two directions are separate flags and are checked separately: `display`
// governs buying from the business, `sell_display` governs selling to it. A
// product can legitimately be one and not the other, so neither is a proxy for
// the other.
//
// An unknown id is refused the same way a hidden one is. It reaches this point
// only from a caller inventing ids, and telling the difference apart in the
// message would confirm which ids exist.
async function refuseProductsThatAreNotLive(
  ids: string[],
  direction: "display" | "sell_display",
  executor?: unknown
): Promise<void> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (unique.length === 0) return;

  const rows = await productService.getLiveness(unique, executor as never);
  const live = new Set(
    rows.filter((r: Record<string, unknown>) => r[direction] === true).map((r: { id: string }) => r.id)
  );
  const refused = unique.filter((id) => !live.has(id));

  if (refused.length > 0) {
    throw badRequest(
      refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`
    );
  }
}

// Returns a MESSAGE, not the cart. The frontend refetches.
export async function syncCart(user_id: string, items: SaleItemsInput[]): Promise<string> {
  return withTransaction(async (client) => {
    await refuseProductsThatAreNotLive(
      (items ?? []).map((i) => i?.id),
      "display",
      client
    );
    await cartRepo.replaceCart(user_id, items, client);
    return "Cart Synced";
  });
}

// A sell cart line is either scrap or a product, told apart by `type`, and the
// two carry different data. The union is what the frontend already switches on.
type SellCartLine =
  | { type: "scrap"; data: PurchaseScrapRow & { id: string } }
  | { type: "product"; data: PurchaseProductRow };

export async function getSellCart(user_id?: string): Promise<SellCartLine[]> {
  if (!user_id) {
    throw badRequest("Missing user_id");
  }

  const cartId = await cartRepo.getSellCartId(user_id);
  if (!cartId) return [];

  const scrapRows = await cartRepo.getSellCartScrapItems(cartId);
  const scrapItems: SellCartLine[] = scrapRows.map((row: PurchaseScrapRow) => ({
    type: "scrap",
    data: {
      ...row,
      // AFTER the spread, not before it. The original wrote `id: row.scrap_id`
      // first and `...row` overwrote it immediately - TS2783 - so the line had
      // no effect. Checked both implementations before moving it: exchange
      // joins `sci.scrap_id = s.id` and projects `s.*`, and the new schema
      // projects `ci.id` under both names, so `id` and `scrap_id` are equal by
      // construction on either side and this changes no value today. It is
      // moved rather than deleted so the author's intent survives if they ever
      // stop being equal.
      id: row.scrap_id,
      // Numeric columns come back as strings from some drivers and as numbers
      // from others depending on the parser; coerced here so the frontend never
      // has to guess. See api/db.js - the NUMERIC parsers live next to the pool
      // for exactly this reason.
      pre_melt: Number(row.pre_melt),
      purity: Number(row.purity),
      content: Number(row.content),
      quantity: row.quantity,
      bid_premium: Number(row.bid_premium),
    },
  }));

  const productRows = await cartRepo.getSellCartProductItems(cartId);
  const productItems: SellCartLine[] = productRows.map((row: PurchaseProductRow) => ({
    type: "product",
    data: {
      ...row,
      quantity: row.quantity,
    },
  }));

  return [...scrapItems, ...productItems];
}

export async function syncSellCart(
  user_id?: string,
  cart?: PurchaseItemsInput[]
): Promise<string> {
  if (!user_id || !Array.isArray(cart)) {
    throw badRequest("Invalid payload");
  }

  return withTransaction(async (client) => {
    // Only the product lines. A scrap line carries its own values and names no
    // product, so it has nothing to check.
    await refuseProductsThatAreNotLive(
      cart.filter((l) => l?.type === "product").map((l) => l?.data?.id as string),
      "sell_display",
      client
    );
    await cartRepo.replaceSellCart(user_id, cart, client);
    return "Sell Cart Synced";
  });
}
