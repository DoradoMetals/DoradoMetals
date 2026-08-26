import withTransaction from "#shared/db/withTransaction.js";
import * as cartRepo from "#features/checkout/repo.js";
import type {
  CartItemRow,
  CartInput,
  SellCartInput,
  SellCartScrapRow,
  SellCartProductRow,
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

export async function getCart(user_id: string): Promise<CartItemRow[]> {
  return await cartRepo.getCart(user_id);
}

// Returns a MESSAGE, not the cart. The frontend refetches.
export async function syncCart(user_id: string, items: CartInput[]): Promise<string> {
  return withTransaction(async (client) => {
    await cartRepo.replaceCart(user_id, items, client);
    return "Cart Synced";
  });
}

// A sell cart line is either scrap or a product, told apart by `type`, and the
// two carry different data. The union is what the frontend already switches on.
export type SellCartLine =
  | { type: "scrap"; data: SellCartScrapRow & { id: string } }
  | { type: "product"; data: SellCartProductRow };

export async function getSellCart(user_id?: string): Promise<SellCartLine[]> {
  if (!user_id) {
    throw badRequest("Missing user_id");
  }

  const cartId = await cartRepo.getSellCartId(user_id);
  if (!cartId) return [];

  const scrapRows = await cartRepo.getSellCartScrapItems(cartId);
  const scrapItems: SellCartLine[] = scrapRows.map((row: SellCartScrapRow) => ({
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
  const productItems: SellCartLine[] = productRows.map((row: SellCartProductRow) => ({
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
  cart?: SellCartInput[]
): Promise<string> {
  if (!user_id || !Array.isArray(cart)) {
    throw badRequest("Invalid payload");
  }

  return withTransaction(async (client) => {
    await cartRepo.replaceSellCart(user_id, cart, client);
    return "Sell Cart Synced";
  });
}
