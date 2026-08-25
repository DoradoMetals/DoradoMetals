// The advisory locks the API tests serialise on, and which tables each covers.
//
// The suite runs test files in parallel, so two files writing the same tables
// deadlock in the full run and pass in isolation - which has happened twice in
// this codebase. A lock per table group is how they agree an order.
//
// ONE LOCK FOR EVERYTHING IS ALSO WRONG, and that is what this replaces. Six
// files were taking 4213, so files that share no tables still queued behind
// each other: an addresses replay test running in 656ms alone took 12.7 seconds
// in the suite. Partitioning brought that one back to 602ms.
//
// IT BARELY MOVED THE TOTAL, and that is worth knowing before anyone spends
// more time here. The suite went 123s to 118s, because its wall clock is set by
// features/orders/create.test.js and parity.test.js, which place whole orders,
// hold both groups, and legitimately serialise with each other - 11 to 14
// seconds per test with nothing to remove. The win was per-file latency and
// correctness, not throughput. Making the suite meaningfully faster means
// making those two files place fewer orders, not adjusting locks.
//
// TAKE THEM IN ASCENDING ORDER. A file needing two must acquire the lower
// number first, every time, or partitioning reintroduces the deadlock it was
// meant to prevent - two files each holding one and waiting for the other.
// takeLocks sorts, so callers cannot get this wrong by listing them the other
// way round.
export const LOCKS = {
  // exchange.sell_cart_items and exchange.scrap, taken by the checkout repo
  // tests because both lock the same two tables in opposite orders otherwise.
  // Kept at its original number so those files did not have to change: this is
  // a registry of what exists, not a renumbering.
  SCRAP_SWEEP: 4207,
  // fulfillments.fulfillments, .pickups, .directs, .shipments
  FULFILLMENTS: 4211,
  // orders.*, checkout.*, exchange.purchase_orders, exchange.sales_orders
  ORDERS: 4213,
  // exchange.addresses, places.addresses, places.user_addresses
  //
  // Separate from ORDERS even though placing an order snapshots an address:
  // most address work does not touch an order, and that is the pair that was
  // costing the most. A file doing both takes both.
  ADDRESSES: 4214,
};

// COVERAGE IS THE HARD PART, and a mechanical check for it was attempted and
// not shipped. What follows is what was learned, because the next person will
// have the same idea.
//
// The failure that prompted it: features/scrap/repo.test.js wrote
// exchange.scrap and exchange.purchase_order_items while taking no lock, and
// deadlocked in a full run after passing in every earlier one. SCRAP_SWEEP had
// been REGISTERED here because the checkout tests already used it, and nothing
// ever asked which OTHER files write the tables it protects. Registering a lock
// is not covering it.
//
// The check would have to answer "which tables does this test write", and the
// writes happen through repos the test imports rather than in the test. Scanning
// the test plus its imports finds the writes but cannot tell a test that CALLS
// them from one that merely imports the module: features/pdf/service.test.js
// and features/purchase-orders/repo.next.test.js came up as needing locks and
// write nothing at all. Narrowing it by counting "write-shaped" call names was
// worse - the heuristic matched `assert.rejects(` in the emails tests.
//
// A check with false positives gets suppressed, so it was not shipped. Doing it
// properly means observing what a transaction actually touched - pg_locks for
// the backend at ROLLBACK time, compared against the advisory locks it holds -
// which is precise, and needs every test file to go through one shared helper
// rather than each defining its own inRollback. That is the version worth
// building; this note exists so it is built rather than re-attempted as a grep.
//
// WHAT WAS DONE INSTEAD: the analysis was run once by hand, its twelve hits
// were checked one at a time, and the eight real ones were given their locks -
// addresses/repo.dual, checkout/repo.dual, checkout/repo.exchange,
// orders/parity, purchase-orders/repo.dual, purchase-orders/repo.refiner-spots,
// purchase-orders/service, sales-orders/repo.dual. Four were false positives
// and were left alone. orders/parity was one of the eight, and it creates
// exchange.scrap - so the file written to prove the two order paths agree was
// itself missing a lock.
export async function takeLocks(client, locks) {
  const wanted = (Array.isArray(locks) ? locks : [locks]).filter(Boolean);
  for (const id of [...new Set(wanted)].sort((a, b) => a - b)) {
    await client.query("SELECT pg_advisory_xact_lock($1)", [id]);
  }
}
