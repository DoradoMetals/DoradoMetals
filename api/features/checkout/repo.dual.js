// Writes the checkout session to both schemas, reads exchange.
//
// exchange stays authoritative while the switch is `dual`, so every read is
// exchange's and every write is both. The two writes are deliberately whole-cart
// replacements rather than paired inserts: exchange keys a scrap line by a row
// in exchange.scrap and the new schema puts the values on the item, so there is
// no shared id to mirror on. "Make this cart equal this list" is the only
// operation both can honour identically.
//
// Both run inside the caller's transaction, so a cart is replaced in both
// schemas or in neither. A checkout that disagrees with itself is worse than one
// that is briefly stale.
//
// The ids differ between the two - a checkout.checkouts row is not an
// exchange.carts row - and that is fine, because nothing outside this feature
// refers to a cart by id. It is looked up by user every time.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/checkout/repo.exchange.js";
import * as next from "#features/checkout/repo.next.ts";

export const getCart = exchange.getCart;
export const getSellCartId = exchange.getSellCartId;
export const getSellCartScrapItems = exchange.getSellCartScrapItems;
export const getSellCartProductItems = exchange.getSellCartProductItems;

export async function replaceCart(user_id, items, client) {
  const run = async (c) => {
    const id = await exchange.replaceCart(user_id, items, c);
    await next.replaceItems(user_id, items, c);
    return id;
  };
  return client ? run(client) : withTransaction(run);
}

export async function replaceSellCart(user_id, cart, client) {
  const run = async (c) => {
    const id = await exchange.replaceSellCart(user_id, cart, c);
    await next.replaceSellItems(user_id, cart, c);
    return id;
  };
  return client ? run(client) : withTransaction(run);
}
