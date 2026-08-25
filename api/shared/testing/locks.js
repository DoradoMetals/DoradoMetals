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

// WHICH FILES TAKE WHICH, kept here because registering a lock is not the same
// as covering the tables it protects. SCRAP_SWEEP was registered because the
// checkout tests already used it, and features/scrap/repo.test.js - which
// deletes exchange.scrap and exchange.purchase_order_items - was taking no lock
// at all. It deadlocked in a full run after passing in every earlier one, which
// is exactly the failure these exist to prevent and exactly how it presents.
//
//   SCRAP_SWEEP   checkout/repo.dual, checkout/repo.exchange, scrap/repo
//   ORDERS        orders/create, orders/parity, orders/intake.repo,
//                 purchase-orders/replay, purchase-orders/ownership,
//                 sales-orders/replay, checkout/replay, fulfillments/replay,
//                 scrap/repo
//   ADDRESSES     addresses/replay, orders/create, orders/parity
//   FULFILLMENTS  fulfillments/repo, fulfillments/replay
//
// A file writing a table in a group and not taking its lock is the bug. That is
// worth checking mechanically rather than maintaining a list by hand, and the
// list above is the thing such a check would replace.
export async function takeLocks(client, locks) {
  const wanted = (Array.isArray(locks) ? locks : [locks]).filter(Boolean);
  for (const id of [...new Set(wanted)].sort((a, b) => a - b)) {
    await client.query("SELECT pg_advisory_xact_lock($1)", [id]);
  }
}
