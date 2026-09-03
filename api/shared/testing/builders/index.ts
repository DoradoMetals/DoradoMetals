// THE FIXTURE LIBRARY (docs/waves/test-suite-redesign.md 1.5 / 2.3, lane 1).
//
// *** WHAT IT REPLACES. *** 234 `SELECT ... LIMIT 1` fixture discoveries
// across 88 of 174 test files, with 149 guard or early-return lines protecting
// them, and 35 files taking their inputs out of FROZEN `exchange` tables. The
// suite's dominant strategy was "find whatever row the database happens to
// hold", which is why `audit:vacuous-tests` had anything to report at all: a
// test whose fixture query returns nothing passes by returning early.
//
// *** THE FOUR RULES. ***
//   1. The pinned client is always the FIRST argument, so every row a builder
//      writes lands in the caller's transaction and disappears with it.
//   2. Every insert goes THROUGH THE REPO, so the repo's guards apply and
//      migration 116's audit trigger stamps the row. `aUser` is the one
//      documented exception - `db/users/repo.ts` has no create, by design.
//   3. Every default is a LITERAL, never a database lookup. Reference rows
//      (Gold, "CARRIER DROPOFF", "Express Saver") are resolved by NAME in
//      builders/reference.ts, which is not discovery: those rows are the
//      literal the test means.
//   4. Ids are minted, readable and file-scoped - see builders/ids.ts.
export { anId, aTag } from "#shared/testing/builders/ids.ts";
export * from "#shared/testing/builders/reference.ts";
export { aUser, anAdmin, type BuiltUser } from "#shared/testing/builders/users.ts";
export { anAddress, type BuiltAddress } from "#shared/testing/builders/places.ts";
export { aProduct, type BuiltProduct } from "#shared/testing/builders/products.ts";
export { anOrder, aStatus, type BuiltOrder } from "#shared/testing/builders/orders.ts";
export { aCart, anAbsentCartId, type BuiltCart } from "#shared/testing/builders/checkout.ts";
export { aShipment, type BuiltShipment } from "#shared/testing/builders/shipping.ts";
export {
  aPayout, aPaymentIntent, TEST_ROUTING, TEST_ACCOUNT, type BuiltPayout,
} from "#shared/testing/builders/payments.ts";
export {
  aRefinerEngagement, type BuiltEngagement,
} from "#shared/testing/builders/refiners.ts";
export { aLead } from "#shared/testing/builders/leads.ts";
export {
  aLedgerEntry, type LedgerRow,
} from "#shared/testing/builders/transactions.ts";
export { aReview } from "#shared/testing/builders/reviews.ts";
