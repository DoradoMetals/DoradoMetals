// Selects which schema the checkout session reads and writes.
//
//   CHECKOUT_SOURCE=exchange  (default) exchange.carts / sell_carts
//   CHECKOUT_SOURCE=dual                writes both, reads exchange
//
// A cart IS a checkout session - Jacob, 2026-08-23 - so the two directions that
// exchange keeps in separate tables become one checkout.checkouts row per
// (user_id, direction), and scrap and bullion share one items table rather than
// scrap living in its own.
//
// There is deliberately no `next`, for the usual reason: this feature writes,
// and writing only to the new schema is the one-way door. repo.next.ts is the
// new implementation; there is NO read-diff for this feature and cannot be one,
// because the schemas deliberately hold different cart states until dual runs
// (no backfill, below). The comparison lives in tests/repo.dual.test.ts, which
// writes through dual and asserts both schemas agree.
//
// Existing cart rows are deliberately not backfilled. Jacob: "It's not data
// that we NEED to keep" - a cart is transient, and on `dual` the next sync
// rewrites it in both schemas anyway.
import * as exchange from "#features/checkout/repo.exchange.js";
import * as dual from "#features/checkout/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.CHECKOUT_SOURCE ?? "")
  ? process.env.CHECKOUT_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getCart = impl.getCart;
export const getSellCartId = impl.getSellCartId;
export const getSellCartScrapItems = impl.getSellCartScrapItems;
export const getSellCartProductItems = impl.getSellCartProductItems;
export const replaceCart = impl.replaceCart;
export const replaceSellCart = impl.replaceSellCart;
