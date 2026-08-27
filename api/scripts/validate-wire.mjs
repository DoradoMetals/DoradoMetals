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

const spots = await import("#features/spots/repo.js");
const carriers = await import("#features/shipping/carriers/repo.js");
const services = await import("#features/shipping/services/repo.js");
const po = await import("#features/purchase-orders/repo.js");
const productsWire = await import("#features/products/wire.ts");
const refinersWire = await import("#features/refiners/wire.ts");
const carriersWire = await import("#features/shipping/carriers/wire.ts");
const spotsWire = await import("#features/spots/wire.ts");
const addressesWire = await import("#features/addresses/wire.ts");

// The public list was checked ONE WAY while the admin list right below it was
// checked both. Same table, same contract, and repo.next exports
// getPublicReviews too - so the one-way check proved the shape only for
// whichever schema REVIEWS_SOURCE currently names, which is exchange. The
// public list is the one an anonymous visitor sees.
await bothWays("GET /carriers", c.CarrierWireNext, "shipping/carriers", (m) => m.getAll());
await bothWays("GET /carriers (legacy wire)", c.CarrierWire, "shipping/carriers", async (m) =>
  carriersWire.toLegacy(await m.getAll())
);
await bothWays("GET /carrier_services", c.CarrierServiceWire, "shipping/services", (m) => m.getAll());
await bothWays("GET /spots/spot_prices", c.SpotPriceWireNext, "spots", (m) => m.getAll());
await bothWays("GET /spots/spot_prices (legacy wire)", c.SpotPriceWire, "spots", async (m) =>
  spotsWire.toLegacy(await m.getAll())
);
// Rates: one implementation after the restructure.
// Reviews: one implementation after the restructure, so no both-ways to run.
// Leads is checked by features/leads/tests/endpoints.test.ts instead:
// after the restructure it has one implementation, so there is no "both ways"
// to run. Its wire shape is the table's own row type.
// Both shapes. The repos return the nested one; the adapter flattens it to what
// the frontend reads, and checking the adapter's OUTPUT is what proves the
// frontend still gets exactly what it got before.
// Refiners: one implementation after the restructure.
await bothWays("GET /carrier_pickups", c.CarrierPickupWire, "shipping/pickups", (m) => m.getAll());

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
await bothWays("GET /addresses", c.AddressWireNext, "addresses", (m) =>
  addressUser ? m.list(addressUser) : []
);
await bothWays("GET /addresses (legacy wire)", c.AddressWire, "addresses", async (m) =>
  addressesWire.toLegacy(addressUser ? await m.list(addressUser) : [])
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
// c.AccountTransactionWire has existed since the transactions split and was
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
  add("GET /get_transactions", c.AccountTransactionWire, () => {
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
    c.AccountTransactionWire,
    () => transactionsService.getTransactionHistory(ledgerUser),
    false
  );
}

// Fulfillments have no repo.exchange, so bothWays has nothing to compare - the
// feature is new capability rather than migrated data, and the only shape it
// has ever had is the one below. That also means these are the endpoints where
// a contract is worth the most: nothing else is checking them.
const fulfillments = await import("#features/fulfillments/repo.js");
const fulfillmentMethods = await import("#features/fulfillments/methods/repo.js");

add("GET /fulfillments/methods (purchase)", c.FulfillmentMethodWire, () =>
  fulfillmentMethods.getAvailable("purchase")
);
add("GET /fulfillments/methods (sale)", c.FulfillmentMethodWire, () =>
  fulfillmentMethods.getAvailable("sale")
);
add("GET /fulfillments/methods/all", c.FulfillmentMethodWire, () =>
  fulfillmentMethods.getAll()
);

// Every fulfillment dev holds, read the way the route reads one. The SHIPMENT
// rows are what exercise the nested detail; pickups and directs are empty
// everywhere until somebody books one, which is why the two booking shapes are
// asserted by the repo tests instead.
add("GET /fulfillments/get_for_order", c.FulfillmentWire, async () => {
  const { rows } = await pool.query(`SELECT order_id FROM fulfillments.fulfillments`);
  const out = [];
  for (const r of rows) out.push(await fulfillments.getByOrder(r.order_id));
  return out.filter(Boolean);
});

add("GET /fulfillments/schedule", c.FulfillmentWire, () => fulfillments.getScheduled());

// The one payments response that is a repo row rather than a Stripe object or a
// client_secret. Both implementations, both shapes.
const paymentsWire = await import("#features/payments/wire.ts");
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
await bothWays("GET /stripe/get_sales_order_payment_intent", c.PaymentIntentWireNext, "payments", intents);
await bothWays(
  "GET /stripe/get_sales_order_payment_intent (legacy wire)",
  c.PaymentIntentWire,
  "payments",
  async (m) => paymentsWire.toLegacy(await intents(m))
);

// The catalogue. The other feature that had no contract, and one the frontend
// leans on hardest - every price on the site is derived from these numbers.
// getSellProducts returns rows getAllProducts does not, because a sell-only
// product has no slug, so both are checked rather than assuming one covers the
// other.
// Two shapes now, and both are checked.
//
// The repos return BullionWire - products.bullion's own names - because that is
// the internal truth from here on. features/products/wire.ts converts it down
// to ProductWire, which is what the frontend reads, and PRODUCTS_WIRE decides
// which one leaves the API.
//
// Checking the adapter's OUTPUT against the legacy contract is the point: it is
// what proves the frontend still gets exactly what it got before, and it keeps
// working as a regression test right up until the adapter is deleted.
await bothWays("GET /products", c.BullionWire, "products", (m) => m.getAllProducts());
await bothWays("GET /products (sell)", c.BullionWire, "products", (m) => m.getSellProducts());
await bothWays("GET /products (legacy wire)", c.ProductWire, "products", async (m) =>
  productsWire.toLegacy(await m.getAllProducts())
);

// Orders. The largest surface here and, until now, the only feature checked
// against exchange alone - everything else goes through bothWays and proves
// repo.next returns the same shape. That is the wrong way round: orders is the
// feature whose promotion carries the most risk.
//
// `diff` already proves the two implementations agree with each other. What it
// cannot prove is that either of them still matches what the frontend expects,
// because if both drift together it stays green. The contract is the
// independent statement, and it is what has to survive promotion.
const orders = await po.getAll();
await bothWays("GET /purchase_orders (admin)", c.PurchaseOrderWire, "purchase-orders", (m) => m.getAll());
await bothWays("GET /sales_orders (admin)", c.SalesOrderWire, "sales-orders", (m) => m.getAll());

// The items, flattened out of those orders, so a bad line is reported as a bad
// line rather than as one failing order among sixteen.
await bothWays("purchase order items", c.PurchaseOrderItemWire, "purchase-orders", async (m) =>
  (await m.getAll()).flatMap((o) => o.order_items ?? [])
);
await bothWays("sales order items", c.SalesOrderItemWire, "sales-orders", async (m) =>
  (await m.getAll()).flatMap((o) => o.order_items ?? [])
);

// Nested shapes, taken off a real order.
add("order.payout", c.PayoutOnOrder, () => orders.map((o) => o.payout).filter((p) => p?.id));
add("order.shipment", c.ShipmentOnOrder, () => orders.map((o) => o.shipment).filter((s) => s?.id));
add("order.user", c.UserOnOrder, () => orders.map((o) => o.user).filter((u) => u?.user_id));
add("order.address", c.AddressOnOrder, () => orders.map((o) => o.address).filter(Boolean));

let pass = 0;
const failures = [];

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
// extra column parsed clean - and features/products/constants.bullion.ts names
// exactly that hazard: "a projection that silently grew is how columns start
// leaking onto the wire". Zero endpoints have one today, so refusing is free.
// If this fires after a deliberate addition, regenerate the contracts.
if (undeclaredTotal.size) {
  console.log(`${undeclaredTotal.size} endpoint(s) RETURN FIELDS NO CONTRACT DECLARES:`);
  for (const [name, keys] of undeclaredTotal) console.log(`        ${name}: ${keys.join(", ")}`);
  console.log("      zod strips these silently - regenerate the contracts, or stop selecting them.");
  console.log();
  process.exitCode = 1;
}
console.log(`${pass} endpoint shape(s) match, ${failures.length} diverge`);
if (failures.length) process.exitCode = 1;
await pool.end();
