// Proves a feature's core-schema implementation is interchangeable with the
// exchange one currently serving traffic.
//
// This is the gate for flipping a feature's *_SOURCE switch. It does not test
// the new code against expectations written by hand - it runs both against real
// rows and requires identical responses. Anything the two schemas disagree
// about, including column defaults, shows up here rather than in production.
//
// Read-only: only the read paths are compared. Write paths are covered
// per-feature where the operation can be safely undone; see diff-leads.mjs.
//
//   pnpm --filter @dorado/api diff            all features
//   pnpm --filter @dorado/api diff leads      one feature
import "#env";
import pool from "#db";

// Each entry names the read operations whose output must match. Extend as
// features move.
const FEATURES = {
  // LEADS IS GONE FROM HERE, AND THAT IS THE COST OF RESTRUCTURING IT.
  //
  // This gate works by running two implementations of the same read and
  // requiring identical output. features/leads has ONE implementation:
  // it reads leads.leads and writes both schemas, so there is no second
  // implementation to compare it against. Deleting repo.exchange.js is what
  // removed the subject.
  //
  // What replaces it is features/leads/tests/endpoints.test.ts, which
  // drives the same URLs over HTTP and asserts the row lands in BOTH schemas -
  // and, by diverging the two tables deliberately, that the read comes from the
  // new one. That is a weaker guarantee than "byte-identical to the old
  // implementation", and it is the trade this restructure makes per feature.
  // Payments is the one feature where the two implementations are EXPECTED to
  // disagree about a status, and the disagreement is the migration being right.
  // exchange's payment_status is only as fresh as the last webhook processed and
  // is demonstrably stale - it records 1 of 25 production intents as succeeded
  // where Stripe shows 8 that took money - while 074 derives status from Stripe.
  //
  // amount_received diverges for the same reason and it is the sharper version
  // of it: for three production intents Stripe captured the money - $51.78,
  // $64.70 and $10.00, $126.48 in total - and exchange.payment_intents records
  // amount_received as null or 0 while still saying requires_payment_method.
  // The new schema has a settlement for each, because 074 derives them from the
  // Stripe export rather than from whatever the webhook last managed to write.
  //
  // So what is compared is the SHAPE and the identifiers, not the status or the
  // money received: both must find the same intent, against the same order, with
  // the same instrument and the same amount expected. The two differences are
  // asserted as tests instead - "a paid intent is never offered for reuse" and
  // "the new schema knows about money exchange has no record of" - because a
  // diff ignore would hide the improvement along with the noise.
  payments: {
    exchange: () => import("#features/payments/repo.exchange.js"),
    next: () => import("#features/payments/repo.next.ts"),
    reads: [
      [
        "getPaymentIntentFromSalesOrderId(first)",
        async (m, ctx) => {
          if (!ctx.sales_order_id) return null;
          const row = await m.getPaymentIntentFromSalesOrderId(ctx.sales_order_id);
          if (!row) return null;
          const { status, amount_received, attempt, created_at, updated_at, ...rest } = row;
          const { status: _s, ...attemptRest } = attempt ?? {};
          return { ...rest, attempt: attemptRest };
        },
      ],
    ],
    context: async () => {
      const { rows } = await pool.query(
        `SELECT e.sales_order_id
           FROM exchange.payment_intents e
           JOIN payments.attempts a ON a.provider_ref = e.payment_intent_id
          WHERE e.sales_order_id IS NOT NULL
          LIMIT 1`
      );
      return { sales_order_id: rows[0]?.sales_order_id ?? null };
    },
  },
  // Reviews is restructured too - one implementation, so nothing to compare.
  // features/reviews/tests/endpoints.test.ts replaces it, and additionally
  // asserts the thing diff never could: that an anonymous visitor cannot reach
  // a hidden review through the one unguarded route in the feature.
  // restructured - one implementation, nothing to compare.
  // carriers restructured - one implementation, nothing to compare.
  // features/shipping/carriers/tests/ replaces it, and asserts what diff never
  // could: that the write reached exchange too.
  // users restructured - one implementation, nothing to compare.
  // carrier services restructured - one implementation, nothing to compare.
  // features/shipping/services/tests/ replaces it, and asserts what diff never
  // could: that the twenty-three values line up with BOTH statements.
  // transactions restructured - one implementation, nothing to compare.
  // pickups restructured - one implementation, nothing to compare.
  // features/shipping/pickups/tests/ replaces it.
  // shipments restructured - one implementation, nothing to compare.
  // features/shipping/shipments/tests/ replaces it, and asserts what diff never
  // could: that the order link survives three hops and lands in the column the
  // direction chooses.
  // tracking restructured - one implementation, nothing to compare.
  // features/shipping/tracking/tests/ replaces it - the first tests this feature
  // has ever had.
  // addresses restructured - one implementation, nothing to compare.
  // features/places/addresses/tests/ replaces it, and asserts what diff never
  // could: that the ownership check survived the split. exchange scoped its
  // writes with `AND user_id = $2`; places.addresses has no user_id to scope on.
  // sales-orders restructured - one implementation, nothing to compare.
  // verify:sales-order-decomposition replaces it and compares against what the
  // switch used to select.
  "purchase-orders": {
    exchange: () => import("#features/purchase-orders/repo.exchange.js"),
    next: () => import("#features/purchase-orders/repo.next.ts"),
    // Values this migration deliberately changed. Keyed by read, because an
    // `id` means something different in each one.
    //
    // A scrap line's id was the scrap row's; there is no scrap row now, so it
    // is the line's instead. A spot row's id was order_metals'; orders.spots
    // generates its own, and nothing keys on it - updateSpot matches on
    // (purchase_order_id, type), which is why it was safe to regenerate.
    // Neither is read by anything; both are declared rather than hidden.
    ignore: {
      "*": ["order_items[].scrap.id"],
      "findMetalsByOrderId(first)": ["id"],
    },
    reads: [
      ["getAll", (m) => m.getAll()],
      ["findById(first)", (m, ctx) => (ctx.id ? m.findById(ctx.id) : [])],
      ["findAllByUser(first)", (m, ctx) => (ctx.userId ? m.findAllByUser(ctx.userId) : [])],
      ["findMetalsByOrderId(first)", (m, ctx) => (ctx.id ? m.findMetalsByOrderId(ctx.id) : [])],
      // The refiner's spot for the order. Unlike orders.spots, refiners.spots
      // keeps the source id, so this one is compared including the id.
      ["findRefinerMetalsByOrderId(first)", (m, ctx) => (ctx.id ? m.findRefinerMetalsByOrderId(ctx.id) : [])],
      ["findOrderScrapItems(first)", (m, ctx) => (ctx.id ? m.findOrderScrapItems(ctx.id) : [])],
      ["findExpiredOffers", (m) => m.findExpiredOffers()],
    ],
    context: async (m) => {
      const [first] = await m.getAll();
      return { id: first?.id, userId: first?.user_id };
    },
  },
  // restructured - one implementation, nothing to compare.
  // products restructured - one implementation, nothing to compare.
  // features/products/tests/ replaces it, and asserts what diff never could:
  // that the three labels compose.ts attaches are the ones the three JOINs
  // produced, product for product.
  // rates is restructured - one implementation, nothing to compare.
