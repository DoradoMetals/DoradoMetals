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
  spots: {
    exchange: () => import("#features/spots/repo.exchange.js"),
    next: () => import("#features/spots/repo.next.ts"),
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getAllMetals", (m) => m.getAllMetals()],
    ],
    context: async () => ({}),
  },
  // Media is restructured - one implementation, so nothing to compare.
  // features/media/tests/endpoints.test.ts replaces it.
  refiners: {
    exchange: () => import("#features/refiners/repo.exchange.js"),
    next: () => import("#features/refiners/repo.next.ts"),
    // The organization's own id. exchange has no equivalent - an organization is
    // a new concept and the migration issued its id - so exchange composes the
    // nested shape without one. The supplier's id is unchanged and is what
    // everything references; this is the organization behind it.
    ignore: { "*": ["organization.id"] },
    reads: [
      ["getAllRefiners", (m) => m.getAllRefiners()],
      ["getRefinerFromId(first)", async (m, ctx) => (ctx.id ? m.getRefinerFromId(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllRefiners())[0]?.id }),
  },
  carriers: {
    exchange: () => import("#features/shipping/carriers/repo.exchange.js"),
    next: () => import("#features/shipping/carriers/repo.next.ts"),
    // The organization's own id, which exchange has no equivalent for - the
    // migration issued it. Same as suppliers. The carrier's id is unchanged,
    // which matters more here: FEDEX_CARRIER_ID is a literal uuid.
    ignore: { "*": ["organization.id"] },
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getById(first)", async (m, ctx) => (ctx.id ? m.getById(ctx.id) : null)],
      ["getNameById(first)", async (m, ctx) => (ctx.id ? m.getNameById(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAll())[0]?.id }),
  },
  users: {
    exchange: () => import("#features/users/repo.exchange.js"),
    next: () => import("#features/users/repo.next.ts"),
    // Both list reads are narrowed to the users exchange actually holds.
    //
    // dev's auth.users carries two rows exchange.users does not, both created
    // 2026-01-14 with no orders and no sessions - leftovers from the January
    // work. Production has none: 74 exchange users, 60 in auth, zero orphans.
    // The 056 trigger only propagates exchange -> auth, so anything already
    // sitting in auth.users stays there and would report a difference forever
    // that says nothing about the two implementations.
    reads: [
      ["getAllUsers(shared)", async (m, ctx) =>
        (await m.getAllUsers()).filter((u) => ctx.ids.includes(u.id))],
      ["getAdminUsers(shared)", async (m, ctx) =>
        (await m.getAdminUsers()).filter((u) => ctx.ids.includes(u.id))],
      ["getUser(first)", (m, ctx) => (ctx.id ? m.getUser(ctx.id) : null)],
    ],
    // Also excludes the one dev user whose email is held in auth.users under a
    // different id. 057 deliberately skips it - auth.users has a unique index
    // on email, and the January work inserted a second row for the same person
    // rather than carrying the id across. Production has zero such collisions,
    // so this excludes nothing there.
    context: async () => {
      const { rows } = await pool.query(
        `SELECT e.id FROM exchange.users e
         WHERE NOT EXISTS (
           SELECT 1 FROM auth.users a WHERE a.email = e.email AND a.id <> e.id
         )
         ORDER BY e.id`
      );
      return { id: rows[0]?.id, ids: rows.map((r) => r.id) };
    },
  },
  services: {
    exchange: () => import("#features/shipping/services/repo.exchange.js"),
    next: () => import("#features/shipping/services/repo.next.ts"),
    // The id is deliberately different in each schema and always will be: 047
    // seeds shipping.services from a dev snapshot and production's exchange
    // rows carry other ids entirely. Nothing references it - there is no
    // foreign key to exchange.carrier_services in dev or production - and what
    // actually resolves a service is (carrier_id, name), which 053 makes
    // unique. Declared here rather than hidden.
    ignore: { "*": ["id"] },
    // Both reads are narrowed to the services exchange actually holds.
    //
    // Not to make the comparison pass - to keep it meaningful. Dev's exchange
    // has 2 carrier services where shipping.services has all 8, because 047
    // seeds the new table from production's set and dev's exchange was never
    // filled in. Comparing unfiltered would report 6 phantom differences that
    // say nothing about the two implementations, and would go on reporting
    // them forever. Production holds 8 on both sides, so there the filter is a
    // no-op. Fixing it in dev would mean writing to exchange, which this
    // migration does not do.
    reads: [
      ["getAll(shared)", async (m, ctx) =>
        (await m.getAll()).filter((s) => ctx.keys.includes(`${s.carrier_id}|${s.name}`))],
      ["getByCarrierId(first)", async (m, ctx) =>
        (ctx.carrierId
          ? (await m.getByCarrierId(ctx.carrierId)).filter((s) => ctx.keys.includes(`${s.carrier_id}|${s.name}`))
          : [])],
    ],
    // getById is not compared: it takes an id, and the two schemas do not share
    // one. getByCarrierId reaches the same rows through a key they do agree
    // about - shipping.carriers reuses exchange.carriers' ids exactly.
    // Only services the seed actually carried data across for.
    //
    // 6 of dev's 8 shipping.services rows are placeholders with every metadata
    // column NULL - they stand in for production services that dev's exchange
    // has never held. One of them is named 'Overnight', which is also the name
    // of a real row in dev's exchange, so filtering by name alone still lines a
    // real row up against a placeholder.
    //
    // The give-away is id 2fb26257: identical created_at, updated_at,
    // display_order and created_by on both sides, but named 'Overnight' in
    // exchange and 'Priority Overnight' in shipping.services. It is one row that
    // was renamed on one side after the other was snapshotted. Production has
    // both names as separate rows with separate ids and no placeholders, so
    // there this filter selects all 8.
    //
    // Requiring created_at on the new side is what separates a carried-across
    // row from a placeholder. What proves the implementation rather than the
    // data is repo.dual.test.js, which mirrors every exchange service and
    // compares all 24 non-id fields.
    context: async () => {
      const { rows } = await pool.query(
        `SELECT e.carrier_id, e.name FROM exchange.carrier_services e
         JOIN shipping.services s
           ON s.carrier_id = e.carrier_id AND s.name = e.name
         WHERE e.carrier_id IS NOT NULL AND s.created_at IS NOT NULL`
      );
      return {
        carrierId: rows[0]?.carrier_id,
        keys: rows.map((r) => `${r.carrier_id}|${r.name}`),
      };
    },
  },
  transactions: {
    exchange: () => import("#features/transactions/repo.exchange.js"),
    next: () => import("#features/transactions/repo.next.ts"),
    // getTransactionHistory returns one row, not a history - see FOLLOWUPS.
    // Compared per user rather than once, because one call proves one row and
    // the reshaping that matters here (two order columns collapsing into one,
    // resolved through orders.orders.direction) is only wrong for some of them.
    reads: [
      [
        "getTransactionHistory(every user)",
        async (m, ctx) => {
          const out = [];
          for (const id of ctx.userIds) out.push(await m.getTransactionHistory(id));
          return out;
        },
      ],
    ],
    context: async () => {
      const { rows } = await pool.query(
        `SELECT DISTINCT user_id FROM exchange.account_transactions ORDER BY user_id`
      );
      return { userIds: rows.map((r) => r.user_id) };
    },
  },
  pickups: {
    exchange: () => import("#features/shipping/pickups/repo.exchange.js"),
    next: () => import("#features/shipping/pickups/repo.next.ts"),
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getByOrder(first)", (m, ctx) => (ctx.orderId ? m.getByOrder(ctx.orderId) : [])],
    ],
    // Both tables are empty in dev and in production, so this compares two
    // empty sets and proves only that neither implementation throws. It earns
    // its place anyway: the exchange side threw on every write until it was
    // split out, and nothing noticed for months.
    context: async () => {
      const { rows } = await pool.query(
        "SELECT order_id FROM exchange.carrier_pickups WHERE order_id IS NOT NULL LIMIT 1"
      );
      return { orderId: rows[0]?.order_id };
    },
  },
  "shipping-shipments": {
    exchange: () => import("#features/shipping/shipments/repo.exchange.js"),
    next: () => import("#features/shipping/shipments/repo.next.ts"),
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getById(first)", (m, ctx) => (ctx.id ? m.getById(ctx.id) : [])],
      ["getByOrder(first)", (m, ctx) => (ctx.orderId ? m.getByOrder(ctx.orderId) : [])],
    ],
    context: async (m) => {
      const all = await m.getAll();
      const withOrder = all.find((s) => s.purchase_order_id || s.sales_order_id) ?? all[0];
      return { id: withOrder?.id, orderId: withOrder?.purchase_order_id ?? withOrder?.sales_order_id };
    },
  },
  "shipping-tracking": {
    exchange: () => import("#features/shipping/tracking/repo.exchange.js"),
    next: () => import("#features/shipping/tracking/repo.next.ts"),
    reads: [["getEvents(first)", (m, ctx) => (ctx.id ? m.getEvents(ctx.id) : [])]],
    // Deliberately a shipment whose events exist in exchange. Three shipments
    // in dev carry tracking rows that exist only in the new schema - artifacts
    // of the January work, absent from production entirely - so comparing one
    // of those would report a difference that cannot exist anywhere real.
    context: async () => {
      const { rows } = await pool.query(
        `SELECT shipment_id AS id FROM exchange.tracking_events
         GROUP BY shipment_id ORDER BY count(*) DESC LIMIT 1`
      );
      return { id: rows[0]?.id };
    },
  },
  addresses: {
    exchange: () => import("#features/addresses/repo.exchange.js"),
    next: () => import("#features/addresses/repo.next.ts"),
    reads: [
      ["list(first user)", (m, ctx) => (ctx.userId ? m.list(ctx.userId) : [])],
      ["getFromId(first)", (m, ctx) => (ctx.id ? m.getFromId(ctx.id) : [])],
      ["isActive(first)", (m, ctx) => (ctx.id ? m.isActive({ addressId: ctx.id, userId: ctx.userId }) : [])],
    ],
    // No read returns every address - list is per user - so the starting point
    // comes from the table rather than from the repo.
    context: async () => {
      const { rows } = await pool.query(
        "SELECT id, user_id FROM exchange.addresses WHERE user_id IS NOT NULL ORDER BY id LIMIT 1"
      );
      return { id: rows[0]?.id, userId: rows[0]?.user_id };
    },
  },
  "sales-orders": {
    exchange: () => import("#features/sales-orders/repo.exchange.js"),
    next: () => import("#features/sales-orders/repo.next.ts"),
    // Same as purchase-orders: orders.spots generates its own id where
    // order_metals had one, and nothing keys on it.
    // orders.spots generates its own ids where exchange.order_metals has its
    // own; refiners.spots keeps the source id, so it is compared.
    ignore: { "findMetalsByOrderId(first)": ["id"] },
    reads: [
      ["getAll", (m) => m.getAll()],
      ["findById(first)", (m, ctx) => (ctx.id ? m.findById(ctx.id) : [])],
      ["findAllByUser(first)", (m, ctx) => (ctx.userId ? m.findAllByUser(ctx.userId) : [])],
      ["findMetalsByOrderId(first)", (m, ctx) => (ctx.id ? m.findMetalsByOrderId(ctx.id) : [])],
    ],
    context: async (m) => {
      const [first] = await m.getAll();
      return { id: first?.id, userId: first?.user_id };
    },
  },
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
  products: {
    exchange: () => import("#features/products/repo.exchange.js"),
    next: () => import("#features/products/repo.next.ts"),
    reads: [
      ["getAllProducts", (m) => m.getAllProducts()],
      ["getSellProducts", (m) => m.getSellProducts()],
      ["getHomepageProducts", (m) => m.getHomepageProducts()],
      ["getAllAdminProducts", (m) => m.getAllAdminProducts()],
      ["getAllTypes", (m) => m.getAllTypes()],
      ["getFilteredProducts(Gold)", (m) => m.getFilteredProducts({ metal_type: "Gold" })],
      ["getProductFromSlug(first)", async (m, ctx) => (ctx.slug ? m.getProductFromSlug(ctx.slug) : [])],
    ],
    context: async (m) => ({ slug: (await m.getAllProducts())[0]?.slug }),
  },
  // rates is restructured - one implementation, nothing to compare.
