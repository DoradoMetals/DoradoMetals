// The advisory locks the API tests serialise on, and which tables each covers.
//
// The suite runs test files in parallel, so two files writing the same tables
// deadlock in the full run and pass in isolation - which has happened twice in
// this codebase. A lock per table group is how they agree an order.
//
// ONE LOCK FOR EVERYTHING IS ALSO WRONG, and that is what this replaces. Six
// files were taking 4213, so the whole suite serialised through its slowest
// path: an addresses replay test that runs in 656ms alone took 12.7 seconds in
// the suite. It was correct and needlessly slow, and slow suites stop being run.
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

export async function takeLocks(client, locks) {
  const wanted = (Array.isArray(locks) ? locks : [locks]).filter(Boolean);
  for (const id of [...new Set(wanted)].sort((a, b) => a - b)) {
    await client.query("SELECT pg_advisory_xact_lock($1)", [id]);
  }
}
