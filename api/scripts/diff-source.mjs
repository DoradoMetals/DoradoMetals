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
  leads: {
    exchange: () => import("#features/leads/repo.exchange.js"),
    next: () => import("#features/leads/repo.next.ts"),
    reads: [
      ["getAllLeads", (m) => m.getAllLeads()],
      ["getLead(first)", async (m, ctx) => (ctx.id ? m.getLead(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllLeads())[0]?.id }),
  },
  reviews: {
    exchange: () => import("#features/reviews/repo.exchange.js"),
    next: () => import("#features/reviews/repo.next.js"),
    reads: [
      ["getAllReviews", (m) => m.getAllReviews()],
      ["getPublicReviews", (m) => m.getPublicReviews()],
      ["getReview(first)", async (m, ctx) => (ctx.id ? m.getReview(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllReviews())[0]?.id }),
  },
  'sales-tax': {
    exchange: () => import("#features/sales-tax/repo.exchange.js"),
    next: () => import("#features/sales-tax/repo.next.js"),
    reads: [
      ["isNexus(TX)", (m) => m.isNexus("TX")],
      ["isNexus(CA)", (m) => m.isNexus("CA")],
      ["getSalesTax(TX, gold coin)", (m) => m.getSalesTax("TX",
        { metal_type: "Gold", product_type: "Coin", purity: 0.999, domestic_tender: true, legal_tender: true, gross: 1 }, 500, 500)],
      ["getSalesTax(CA, silver bar)", (m) => m.getSalesTax("CA",
        { metal_type: "Silver", product_type: "Bar", purity: 0.999, domestic_tender: false, legal_tender: false, gross: 10 }, 5000, 5000)],
    ],
    context: async () => ({}),
  },
  spots: {
    exchange: () => import("#features/spots/repo.exchange.js"),
    next: () => import("#features/spots/repo.next.js"),
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getAllMetals", (m) => m.getAllMetals()],
    ],
    context: async () => ({}),
  },
  media: {
    exchange: () => import("#features/media/repo.exchange.js"),
    next: () => import("#features/media/repo.next.js"),
    reads: [
      ["getTestImages", (m) => m.getTestImages()],
      ["getImageById(first)", async (m, ctx) => (ctx.id ? m.getImageById(ctx.id) : null)],
      ["listImagesByUser(first)", async (m, ctx) => (ctx.user ? m.listImagesByUser(ctx.user) : [])],
    ],
    context: async (m) => { const r = (await m.getTestImages())[0]; return { id: r?.id, user: r?.user_id }; },
  },
  suppliers: {
    exchange: () => import("#features/suppliers/repo.exchange.js"),
    next: () => import("#features/suppliers/repo.next.js"),
    reads: [
      ["getAllSuppliers", (m) => m.getAllSuppliers()],
      ["getSupplierFromId(first)", async (m, ctx) => (ctx.id ? m.getSupplierFromId(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllSuppliers())[0]?.id }),
  },
  carriers: {
    exchange: () => import("#features/shipping/carriers/repo.exchange.js"),
    next: () => import("#features/shipping/carriers/repo.next.js"),
    reads: [
      ["getAll", (m) => m.getAll()],
      ["getById(first)", async (m, ctx) => (ctx.id ? m.getById(ctx.id) : null)],
      ["getNameById(first)", async (m, ctx) => (ctx.id ? m.getNameById(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAll())[0]?.id }),
  },
  services: {
    exchange: () => import("#features/shipping/services/repo.exchange.js"),
    next: () => import("#features/shipping/services/repo.next.js"),
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
  pickups: {
    exchange: () => import("#features/shipping/pickups/repo.exchange.js"),
    next: () => import("#features/shipping/pickups/repo.next.js"),
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
    next: () => import("#features/shipping/shipments/repo.next.js"),
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
    next: () => import("#features/shipping/tracking/repo.next.js"),
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
    next: () => import("#features/addresses/repo.next.js"),
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
    next: () => import("#features/sales-orders/repo.next.js"),
    // Same as purchase-orders: orders.spots generates its own id where
    // order_metals had one, and nothing keys on it.
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
    next: () => import("#features/purchase-orders/repo.next.js"),
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
      ["findOrderScrapItems(first)", (m, ctx) => (ctx.id ? m.findOrderScrapItems(ctx.id) : [])],
      ["findExpiredOffers", (m) => m.findExpiredOffers()],
    ],
    context: async (m) => {
      const [first] = await m.getAll();
      return { id: first?.id, userId: first?.user_id };
    },
  },
  mints: {
    exchange: () => import("#features/mints/repo.exchange.js"),
    next: () => import("#features/mints/repo.next.js"),
    reads: [["getAllMints", (m) => m.getAllMints()]],
  },
  products: {
    exchange: () => import("#features/products/repo.exchange.js"),
    next: () => import("#features/products/repo.next.js"),
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
  rates: {
    exchange: () => import("#features/rates/repo.exchange.js"),
    next: () => import("#features/rates/repo.next.js"),
    reads: [
      ["getAllRates", (m) => m.getAllRates()],
      ["getAdminRates", (m) => m.getAdminRates()],
      ["getRate(first)", async (m, ctx) => (ctx.id ? m.getRate(ctx.id) : null)],
    ],
    context: async (m) => ({ id: (await m.getAllRates())[0]?.id }),
  },
};

// Row order is only meaningful where the query states an ORDER BY, and both
// implementations carry the same one - so compare as-is rather than sorting,
// which would hide an ordering regression.
const norm = (v) => JSON.stringify(v);

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(FEATURES);

let pass = 0;
const failures = [];

for (const name of names) {
  const feature = FEATURES[name];
  if (!feature) {
    console.log(`  ?     ${name} is not a known feature`);
    continue;
  }

  const [ex, co] = [await feature.exchange(), await feature.next()];
  // context is optional: a feature whose reads take no arguments - mints, say -
  // has nothing to look up first.
  const ctx = feature.context ? await feature.context(ex) : {};

  // Values a migration deliberately changed, declared per feature. Dropped from
  // both sides before comparing, so the gate keeps meaning something instead of
  // being a wall of known noise. `order_items[].scrap.id` reads as: for each
  // element of order_items, delete scrap.id.
  const drop = (value, pathParts) => {
    if (value == null || !pathParts.length) return;
    const [head, ...rest] = pathParts;
    if (head.endsWith("[]")) {
      const arr = value[head.slice(0, -2)];
      if (Array.isArray(arr)) for (const el of arr) drop(el, rest);
      return;
    }
    if (!rest.length) delete value[head];
    else drop(value[head], rest);
  };
  const strip = (rows, label) => {
    const paths = [...(feature.ignore?.["*"] ?? []), ...(feature.ignore?.[label] ?? [])];
    if (!paths.length || rows == null) return rows;
    const copy = structuredClone(rows);
    for (const row of Array.isArray(copy) ? copy : [copy]) {
      for (const path of paths) drop(row, path.split("."));
    }
    return copy;
  };

  for (const [label, run] of feature.reads) {
    const [a, b] = [strip(await run(ex, ctx), label), strip(await run(co, ctx), label)];
    const size = Array.isArray(a) ? `${a.length} vs ${b?.length}` : "1";
    if (norm(a) === norm(b)) {
      pass++;
      console.log(`  ok    ${name}.${label}  (${size})`);
    } else {
      failures.push({ name: `${name}.${label}`, a: norm(a), b: norm(b) });
      console.log(`  FAIL  ${name}.${label}  (${size})`);
    }
  }
}

if (failures.length) {
  console.log();
  for (const f of failures) {
    console.log(`FAIL  ${f.name}`);
    console.log(`  exchange: ${f.a.slice(0, 300)}`);
    console.log(`  core:     ${f.b.slice(0, 300)}`);
  }
}

console.log();
console.log(`${pass} operation(s) identical, ${failures.length} diverge`);
if (failures.length) process.exitCode = 1;
await pool.end();
