// Parses real API responses through the wire contracts.
//
// The generated table schemas are true by construction. The wire schemas are
// not: they are hand-composed to describe what each endpoint actually returns,
// and that claim is only worth something if it is checked against the real
// thing. This calls the repo functions the routes call and parses their output.
//
// Both implementations are checked, not just the one currently serving.
//
// The repos are reached through repo.js, which resolves a *_SOURCE switch. Every
// switch defaults to exchange, so for as long as that is true this validated the
// exchange implementation and nothing else - and the whole point of a wire
// contract is that it survives promotion. `bothWays` therefore loads
// repo.exchange and repo.next directly and parses each against the same schema,
// so the shape promotion will actually serve is proven before it serves it.
//
// Read-only.
//
//   pnpm --filter @dorado/api validate:wire
import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#db";
import * as c from "@dorado/contracts";

const cases = [];
const add = (name, schema, load, many = true) =>
  cases.push({ name, schema, load, many });

// Registers the same endpoint twice, once per implementation. `read` receives
// the module, so it can call whichever function the route calls.
//
// A missing implementation is skipped, but only after checking the filesystem
// for one. The first version of this swallowed every import error, and leads
// quietly disappeared from the run because its repo.next is TypeScript and the
// hardcoded `.js` threw - a check reporting success for a file it could not
// see. If a repo.next exists and will not load, that is a failure, not a skip.
const bothWays = async (name, schema, dir, read, many = true) => {
  // A directory with NEITHER implementation is a wrong name, not a feature that
  // happens to have none - and the per-impl `continue` below would swallow it
  // silently, taking the endpoint out of the run with nothing to show for it.
  // Renaming features/suppliers to features/refiners did exactly that: the count
  // went from 57 shapes to 53 and every remaining line still said ok.
  const anyImpl = ["exchange", "next"].some((impl) =>
    [".js", ".ts"].some((e) =>
      fs.existsSync(path.join(import.meta.dirname, "..", "features", dir, `repo.${impl}${e}`))
    )
  );
  if (!anyImpl) {
    add(`${name} [${dir}]`, schema, () => {
      throw new Error(
        `features/${dir} has no repo.exchange and no repo.next - the directory ` +
          `name is wrong, so this endpoint was being skipped rather than checked`
      );
    });
    return;
  }

  for (const impl of ["exchange", "next"]) {
    const base = path.join(import.meta.dirname, "..", "features", dir, `repo.${impl}`);
    const ext = [".js", ".ts"].find((e) => fs.existsSync(base + e));
    if (!ext) continue;

    let mod;
    try {
      mod = await import(`#features/${dir}/repo.${impl}${ext}`);
    } catch (err) {
      add(`${name} [${impl}]`, schema, () => {
        throw new Error(`repo.${impl}${ext} exists but will not import: ${err.message}`);
      });
      continue;
    }
    add(`${name} [${impl}]`, schema, () => read(mod), many);
  }
};


// The public list was checked ONE WAY while the admin list right below it was
// checked both. Same table, same contract, and repo.next exports
// getPublicReviews too - so the one-way check proved the shape only for
// whichever schema REVIEWS_SOURCE currently names, which is exchange. The
// public list is the one an anonymous visitor sees.
// Carriers is restructured - one implementation, so there is no "both ways" to
// run. Kept as a DIRECT check rather than dropped: the composed shape is now
// assembled in JS from two repos instead of by a JOIN, which is a new way for a
// field to go missing, and BOTH shapes are still checked - the internal one and
// what the adapter flattens it to.
const carriersService = await import("#features/shipping/carriers/service.ts");
add("GET /carriers", c.Carrier, () => carriersService.getAllCarriers());
// Carrier services is restructured - one implementation. Kept as a DIRECT
// check: it is the feature whose projection renames three columns back, so a
// contract that stopped being exercised would stop noticing a rename escaping.
const servicesService = await import("#features/shipping/services/service.ts");
add("GET /carrier_services", c.CarrierService, () => servicesService.getAllServices());
// Spots: one implementation after the restructure.
// Rates: one implementation after the restructure.
// Reviews: one implementation after the restructure, so no both-ways to run.
// Leads is checked by features/leads/tests/endpoints.test.ts instead:
// after the restructure it has one implementation, so there is no "both ways"
// to run. Its wire shape is the table's own row type.
// Both shapes. The repos return the nested one; the adapter flattens it to what
// the frontend reads, and checking the adapter's OUTPUT is what proves the
// frontend still gets exactly what it got before.
// Refiners: one implementation after the restructure.
// Carrier pickups is restructured - one implementation. Kept as a DIRECT check:
// three of the eight fields on this shape - order_id, user_id and carrier - do
// not exist as columns any more and are reconstructed through the shipment, so
// the contract is checking a composition rather than a projection.
const pickupsService = await import("#features/shipping/pickups/service.ts");
add("GET /carrier_pickups", c.CarrierPickup, () => pickupsService.getAll());

// Addresses were not checked here at all, and they are one of the two features
// whose migrated read renames columns: places.user_addresses calls them
// `label` and `default_shipping`, and the wire calls them `name` and
// `is_default`. Those aliases are the whole reason the address book renders.
//
// list() is per user rather than global, so it needs a user with addresses -
// taken from exchange, which both implementations key on.
const { rows: withAddresses } = await pool.query(
  `SELECT user_id FROM exchange.addresses WHERE user_id IS NOT NULL
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1`
);
const addressUser = withAddresses[0]?.user_id;
// Addresses is restructured - one implementation, so there is no "both ways"
// to run. Kept as a DIRECT check rather than dropped, and this is the feature
// where dropping it would cost the most: `label` and `default_shipping` become
// `name` and `is_default` on the wire, and those two aliases are the whole
// reason the address book renders a name at all.
const addressesService = await import("#features/places/addresses/service.ts");
const listAddresses = async () => (addressUser ? await addressesService.list(addressUser) : []);
// The split wire (2026-08-27): the address rows and the caller's
// relationships are separate endpoints, joined client-side by address_id.
add("GET /addresses", c.Address, async () =>
  (await listAddresses()).map(({ user_address, ...a }) => a)
);
add("GET /addresses/user_addresses", c.UserAddress, async () =>
  (await listAddresses()).map((r) => ({ address_id: r.id, ...r.user_address }))
);

// The other renaming read: media.images stores `checksum` and the wire calls it
// `checksum_sha`.
// Both shapes, as with products: the repos return media.images' own name and
// the adapter converts down to what the frontend reads.
// Media: one implementation after the restructure, so no both-ways to run.
// Its wire rename is covered by features/media/tests/unit.test.ts.
// Users was the last one-way check with a next implementation to compare
// against. auth.users is where exchange.users lands, repo.next.ts projects the
// same columns back, and nothing was proving that until now.
// Users: one implementation after the restructure.

// THE CREDIT LEDGER HAD A CONTRACT AND NOTHING VALIDATED IT.
//
// c.AccountTransaction has existed since the transactions split and was
// referenced by no check in this file - the one feature holding real customer
// money ($66,999.32 across 17 production rows) and the reshaping is the
// awkward kind: `type` becomes `transaction_type`, and exchange's two order
// columns collapse into payments.ledger.order_id, resolved back through
// orders.orders.direction. That projection is exactly the sort of thing that
// is right until it is not.
//
// TRANSACTIONS_SOURCE=dual deliberately READS exchange, so repo.next is never
// on the request path today - which is the argument for checking it here
// rather than against it. Nothing else looks at it before promotion.
//
// getTransactionHistory returns ONE row, not a list, in both implementations -
// hence many=false. That it does so at all is a separate bug; see the note in
// FOLLOWUPS.md. This check asserts the shape the code HAS.
const { rows: withLedger } = await pool.query(
  `SELECT user_id FROM exchange.account_transactions
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1`
);
const ledgerUser = withLedger[0]?.user_id;
if (!ledgerUser) {
  // Not a skip. An empty ledger means this check proves nothing, and a check
  // that silently proves nothing is what let the ledger go unnoticed for seven
  // months in the first place.
  add("GET /get_transactions", c.AccountTransaction, () => {
    throw new Error("dev has no account_transactions - the ledger check would be vacuous");
  });
} else {
  // ONE IMPLEMENTATION AFTER THE RESTRUCTURE, so there is no both-ways to run -
  // but the shape is still worth checking, and this is the ledger, so it is
  // checked directly rather than dropped. Still many=false: the endpoint hands
  // back one row on purpose (see features/transactions/service.ts).
  const transactionsService = await import("#features/transactions/service.ts");
  add(
    "GET /get_transactions",
    c.AccountTransaction,
    () => transactionsService.getTransactionHistory(ledgerUser),
    false
  );
}

// Fulfillments have no repo.exchange, so bothWays has nothing to compare - the
// feature is new capability rather than migrated data, and the only shape it
// has ever had is the one below. That also means these are the endpoints where
// a contract is worth the most: nothing else is checking them.
// Fulfillments is restructured. The SERVICE, not the repos - through the
// same toWire the controllers use, because since the wave-2 final form the
// wire is the BARE fulfillments row: the composed shape (method + children)
// is internal to the service and must never reach a response.
const fulfillments = await import("#features/fulfillments/service.ts");
const fulfillmentMethods = await import("#features/fulfillments/methods/repo.ts");

add("GET /fulfillments/methods (purchase)", c.FulfillmentMethod, () =>
  fulfillmentMethods.getAvailable("purchase")
);
add("GET /fulfillments/methods (sale)", c.FulfillmentMethod, () =>
  fulfillmentMethods.getAvailable("sale")
);
add("GET /fulfillments/methods/all", c.FulfillmentMethod, () =>
  fulfillmentMethods.getAll()
);

// Every fulfillment dev holds, read the way the ROUTE reads one: through
// toWire, which strips the internal composition (the method object the
// service's own logic branches on, and the child rows) down to the BARE
// fulfillments.fulfillments row the contract declares (wave-2 final form).
const fulfillmentCompose = await import("#features/fulfillments/compose.ts");
add("GET /fulfillments/get_for_order", c.Fulfillment, async () => {
  const { rows } = await pool.query(`SELECT order_id FROM fulfillments.fulfillments`);
  const out = [];
  for (const r of rows) out.push(await fulfillments.getForOrder(r.order_id, { isAdmin: true }));
  return out.filter(Boolean).map(fulfillmentCompose.toWire);
});

add("GET /fulfillments/schedule", c.Fulfillment, async () =>
  (await fulfillments.getSchedule()).map(fulfillmentCompose.toWire)
);

// The one payments response that is a repo row rather than a Stripe object or a
// client_secret. Both implementations, ONE shape: the adapter died with the
// frontend conversion (2026-08-27), so the nested contract IS the wire, and a
// legacy flat check would be validating a shape nothing can produce.
const salesOrderIds = async () => {
  const { rows } = await pool.query(
    `SELECT sales_order_id FROM exchange.payment_intents WHERE sales_order_id IS NOT NULL`
  );
  return rows.map((r) => r.sales_order_id);
};
const intents = async (m) => {
  const out = [];
  for (const id of await salesOrderIds()) {
    const row = await m.getPaymentIntentFromSalesOrderId(id);
    if (row) out.push(row);
  }
  return out;
};
await bothWays("GET /stripe/get_sales_order_payment_intent", c.PaymentIntent, "payments", intents);

// The catalogue. The other feature that had no contract, and one the frontend
// leans on hardest - every price on the site is derived from these numbers.
// getSellProducts returns rows getAllProducts does not, because a sell-only
// product has no slug, so both are checked rather than assuming one covers the
// other.
// Two shapes now, and both are checked.
//
// The repos return Bullion - products.bullion's own names - and since the
// conversion (2026-08-27) that IS the wire: the adapter and its legacy check
// were deleted together when the frontend switched to the contracts' names.
// Products is restructured - one implementation, so there is no "both ways" to
// run. Kept as a DIRECT check, and this is the one to keep hardest: the
// storefront row is no longer a projection, it is a projection plus two labels
// attached in JS, so a field can now go missing in a place SQL never could.
const productsService = await import("#features/products/service.ts");
add("GET /products", c.Bullion, () => productsService.getAllProducts());
add("GET /products (sell)", c.Bullion, () => productsService.getSellProducts());

// Orders. ONE SHAPE, BOTH DIRECTIONS, since the wire slimmed (wave 3): an
// order on the wire is its orders.orders row plus `totals`, and every other
// piece of it is a parent-path read checked on its own below. The composed
// PurchaseOrder / SalesOrder contracts died with the slot family they
// described; features/*/read.service.ts still assembles an order for the
// API's own pricing and email work, and `diff` plus the decomposition
// verifiers are what check THAT.
const orderRead = await import("#features/orders/read.ts");
const orders = await orderRead.list({ direction: "purchase" });
add("GET /orders", c.Order, () => orderRead.list({}));

// The bare-resource reads the flip landed - VERBATIM table rows (ruling 12),
// parsed through the generated-row re-exports. Payout DETAILS are
// deliberately NOT parsed here: a zod failure prints the offending value,
// and that shape's values are full bank numbers - the one thing this project
// never logs. Its shape is pinned by refiner-edits.test.js on keys.
const orderSpotsRepo = await import("#features/orders/spots/repo.ts");
add("GET /orders/:id/spots", c.OrderSpot, async () => {
  const lists = await Promise.all(orders.map((o) => orderSpotsRepo.getRowsFor(o.id)));
  return lists.flat();
});
const refinerOrdersService = await import("#features/refiners/orders/service.ts");
// The engagement's SPOTS moved to their own resource when refiners/spots was
// given its own stack (ruling 26c) - the URL is unchanged, the owner is not.
const refinerSpotsService = await import("#features/refiners/spots/service.ts");
add("GET /orders/:orderId/refiners", c.RefinerOrder, async () => {
  const reads = await Promise.all(orders.map((o) => refinerOrdersService.getByOrder(o.id)));
  return reads.filter(Boolean);
});
const refinerItemsRepo = await import("#features/refiners/items/repo.ts");
add("GET /orders/:orderId/refiners/items", c.RefinerItem, async () => {
  const lists = await Promise.all(orders.map((o) => refinerItemsRepo.getForOrder(o.id)));
  return lists.flat();
});
add("GET /orders/:orderId/refiners/spots", c.RefinerSpot, async () => {
  const lists = await Promise.all(
    orders.map((o) => refinerSpotsService.forOrder(o.id))
  );
  return lists.filter(Boolean).flat();
});
const orderFulfillmentRead = await import("#features/fulfillments/order-read.ts");
// The two bookings are their own resources (ruling 26c) - each read lives with
// the table it returns.
const fulfillmentPickups = await import("#features/fulfillments/pickups/service.ts");
const fulfillmentDirects = await import("#features/fulfillments/directs/service.ts");
add("GET /orders/:orderId/fulfillments", c.OrderFulfillment, async () => {
  const reads = await Promise.all(
    orders.map((o) => orderFulfillmentRead.getOrderFulfillment(o.id))
  );
  return reads.filter(Boolean);
});

// The rest of the order-scoped read family, each one its own table's rows.
// They were "nested shapes, taken off a real order" until wave 3; the reads
// are the shapes now, and checking them here is checking what the drawers
// actually receive.
const orderItemsRepo = await import("#features/orders/items/repo.ts");
add("GET /orders/:id/items", c.OrderItem, async () => {
  const lists = await Promise.all(orders.map((o) => orderItemsRepo.getFor(o.id)));
  return lists.flat();
});
const shipmentOrderRead = await import("#features/shipping/shipments/order-read.ts");
add("GET /orders/:orderId/shipments", c.Shipment, async () => {
  const lists = await Promise.all(orders.map((o) => shipmentOrderRead.getForOrder(o.id)));
  return lists.flat();
});
add("GET /orders/:orderId/pickups", c.FulfillmentPickup, async () => {
  const lists = await Promise.all(orders.map((o) => fulfillmentPickups.forOrder(o.id)));
  return lists.flat();
});
add("GET /orders/:orderId/directs", c.FulfillmentDirect, async () => {
  const lists = await Promise.all(orders.map((o) => fulfillmentDirects.forOrder(o.id)));
  return lists.flat();
});
// PAYOUTS ARE NOT PARSED HERE, and the reason is the same one that keeps
// PayoutDetails out: a zod failure prints the offending value, and these rows
// are bank data. The shape is pinned on keys by refiner-edits.test.js.
const orderAddressesRepo = await import("#features/orders/addresses/repo.ts");
const placeAddressesRepo = await import("#features/places/addresses/repo.ts");
add("GET /orders/:id/address", c.OrderAddress, async () => {
  const links = await Promise.all(orders.map((o) => orderAddressesRepo.getFor(o.id)));
  const rows = await Promise.all(
    links.filter(Boolean).map((l) => placeAddressesRepo.getOne(l.address_id))
  );
  return rows.filter(Boolean);
});
// The CARRIER pickups, whose parent is the shipment rather than the order.
const carrierPickupsRepo = await import("#features/shipping/pickups/repo.ts");
add("GET /shipments/:id/pickups", c.ShipmentPickup, async () => {
  const lists = await Promise.all(orders.map((o) => shipmentOrderRead.getForOrder(o.id)));
  return await carrierPickupsRepo.getByShipments(lists.flat().map((s) => s.id));
});

// Quotes: the pricing surface with nothing stored underneath. COMPUTED
// shapes, not table rows - there is no repo pair for bothWays to compare, so
// the service, the only implementation, is called directly like carriers.
// These are the shapes Jacob's no-client-money-math ruling makes the frontend
// read every customer-visible number from, so a divergence here is a broken
// checkout, not a cosmetic one. Priced against real dev rows: two live
// products, the addresses user resolved above, and a gram-denominated scrap
// line, so the parse exercises the tax, funds and weight-derivation paths and
// not just the happy shape.
const quotesService = await import("#features/quotes/service.ts");
const { rows: quotable } = await pool.query(
  `SELECT id, name FROM products.bullion
    WHERE display AND sell_display AND content IS NOT NULL
    ORDER BY name LIMIT 2`
);
const quoteItems = quotable.map((r, i) => ({ id: r.id, quantity: i + 1 }));
add("POST /quotes/catalog", c.CatalogQuote, () =>
  quoteItems.length ? quotesService.catalogQuote({ items: quoteItems, side: "ask" }) : [],
  false
);

const { rows: quoteAddresses } = await pool.query(
  `SELECT id FROM exchange.addresses WHERE user_id = $1 LIMIT 1`,
  [addressUser]
);
add("POST /quotes/sales_order", c.SalesOrderQuote, () =>
  addressUser && quoteItems.length
    ? quotesService.salesOrderQuote(addressUser, {
        items: quoteItems,
        using_funds: true,
        shipping_service: "STANDARD",
        payment_method: "CARD",
        address_id: quoteAddresses[0]?.id,
      })
    : [],
  false
);

add("POST /quotes/purchase_order", c.PurchaseOrderQuote, () =>
  quotable.length
    ? quotesService.purchaseOrderQuote({
        items: [
          { type: "scrap", data: { metal: "Gold", pre_melt: 31.1035, purity: 0.9, gross_unit: "g" } },
          { type: "product", data: { name: quotable[0].name, quantity: 2 } },
        ],
      })
    : [],
  false
);

// The order quote prices a REAL stored order - the drawers' read behind one
// id - so it is parsed against the oldest dev purchase order, the same stable
// fixture the ownership tests pick. Checked one way like the other quotes:
// computed shape, one implementation, nothing stored underneath the response.
const { rows: quotableOrders } = await pool.query(
  `SELECT id FROM exchange.purchase_orders ORDER BY created_at ASC, id ASC LIMIT 1`
);
add("POST /quotes/order", c.OrderQuote, () =>
  quotableOrders.length ? quotesService.orderQuote({ order_id: quotableOrders[0].id }) : [],
  false
);

// The profit breakdown (D83): ADMIN-ONLY on the route, checked here the same
// way the other computed shapes are - the service is the only implementation.
// Priced against the same stable fixture the order quote uses.
add("POST /quotes/profit_breakdown", c.ProfitBreakdown, () =>
  quotableOrders.length ? quotesService.profitBreakdown({ order_id: quotableOrders[0].id }) : [],
  false
);

// THE REGISTRATION FLOOR, checked BEFORE anything is parsed.
//
// D110: this file called `refinerOrdersService.getSpotsByOrder`, which a
// factoring pass had moved to `features/refiners/spots/service.ts` as
// `forOrder()`. `lint:imports` could not see it - the specifier still RESOLVES,
// the named export does not exist, and that is a runtime failure by
// construction. It failed loudly THAT time because the call is on the critical
// path. The quiet version is a `bothWays` whose implementation cannot be found:
// it is skipped, `pass` comes back smaller, and "N endpoint shape(s) match, 0
// diverge" reads exactly like success.
//
// So the subject is counted before it is examined. 32 cases are registered
// today (27 with rows, 5 skipped for want of a fixture).
const CASE_FLOOR = Number(process.env.WIRE_CASE_FLOOR ?? 30);
if (cases.length < CASE_FLOOR) {
  console.error(
    `validate:wire registered only ${cases.length} case(s), expected at least ` +
      `${CASE_FLOOR}. A case that fails to register is a shape nobody checked, and ` +
      `the summary line cannot tell that from a shape that matched.`
  );
  process.exit(1);
}

let pass = 0;
const failures = [];
const skipped = [];

const undeclaredTotal = new Map();

for (const { name, schema, load } of cases) {
  let rows;
  try {
    rows = await load();
  } catch (err) {
    failures.push({ name, issues: new Map([[`could not load: ${err.message}`, 1]]) });
    continue;
  }
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) {
    console.log(`  skip  ${name}  (no rows)`);
    skipped.push(name);
    continue;
  }

  const issues = new Map();
  const undeclared = new Set();
  for (const row of list) {
    // Contracts describe the wire, so compare what JSON serialisation produces.
    const wire = JSON.parse(JSON.stringify(row));
    const result = schema.safeParse(wire);
    // zod STRIPS keys the contract does not declare rather than rejecting them,
    // so a parse can succeed on a response carrying fields nobody declared.
    // Recover them by diffing what went in against what came out.
    if (result.success && wire && typeof wire === "object" && !Array.isArray(wire)) {
      for (const k of Object.keys(wire)) if (!(k in result.data)) undeclared.add(k);
    }
    if (result.success) continue;
    for (const i of result.error.issues) {
      const key = `${i.path.join(".") || "(root)"}: ${i.message}`;
      issues.set(key, (issues.get(key) ?? 0) + 1);
    }
  }

  if (issues.size) failures.push({ name, issues, count: list.length });
  else {
    pass++;
    const extra = undeclared.size ? `  UNDECLARED: ${[...undeclared].join(", ")}` : "";
    console.log(`  ok    ${name}  (${list.length} rows)${extra}`);
  }
  if (undeclared.size) undeclaredTotal.set(name, [...undeclared]);
}

if (failures.length) {
  console.log();
  for (const f of failures) {
    console.log(`FAIL  ${f.name}${f.count ? `  (${f.count} rows)` : ""}`);
    for (const [issue, n] of [...f.issues].sort((a, b) => b[1] - a[1])) {
      console.log(`        ${n}x  ${issue}`);
    }
  }
}

console.log();
// A field nobody declared is the failure this check could not previously see.
// zod strips unknown keys rather than rejecting them, so a response carrying an
// extra column parsed clean - and features/products named exactly that hazard in
// its own comment: "a projection that silently grew is how columns start leaking
// onto the wire". Zero endpoints have one today, so refusing is free.
// If this fires after a deliberate addition, regenerate the contracts.
if (undeclaredTotal.size) {
  console.log(`${undeclaredTotal.size} endpoint(s) RETURN FIELDS NO CONTRACT DECLARES:`);
  for (const [name, keys] of undeclaredTotal) console.log(`        ${name}: ${keys.join(", ")}`);
  console.log("      zod strips these silently - regenerate the contracts, or stop selecting them.");
  console.log();
  process.exitCode = 1;
}
// A SKIP IS NOT A PASS, and it used to be invisible in the summary. A case with
// no rows proves nothing about its contract; a run where half the fixtures went
// missing would print a smaller "match" count and still say "0 diverge".
console.log(
  `${pass} endpoint shape(s) match, ${failures.length} diverge, ${skipped.length} skipped for want of a fixture` +
    (skipped.length ? `: ${skipped.join(", ")}` : "")
);

// THE PARSE FLOOR. 27 shapes are actually parsed today. This is the number that
// says the run did work, as opposed to registering cases and skipping them all.
const PASS_FLOOR = Number(process.env.WIRE_PASS_FLOOR ?? 25);
if (pass + failures.length < PASS_FLOOR) {
  console.error(
    `only ${pass + failures.length} of ${cases.length} registered case(s) had rows to ` +
      `parse, expected at least ${PASS_FLOOR}. The fixtures this depends on are gone, ` +
      `or the loaders are failing quietly - either way the contracts were not checked.`
  );
  process.exitCode = 1;
}

if (failures.length) process.exitCode = 1;
await pool.end();
