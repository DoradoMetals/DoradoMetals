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
const bothWays = async (name, schema, dir, read) => {
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
    add(`${name} [${impl}]`, schema, () => read(mod));
  }
};

const spots = await import("#features/spots/repo.js");
const rates = await import("#features/rates/repo.js");
const reviews = await import("#features/reviews/repo.js");
const leads = await import("#features/leads/repo.js");
const suppliers = await import("#features/suppliers/repo.js");
const carriers = await import("#features/shipping/carriers/repo.js");
const services = await import("#features/shipping/services/repo.js");
const users = await import("#features/users/repo.js");
const po = await import("#features/purchase-orders/repo.js");
const { toLegacyShape } = await import("#features/products/wire.js");
const mediaWire = await import("#features/media/wire.js");

add("GET /reviews (public)", c.ReviewWire, () => reviews.getPublicReviews());
await bothWays("GET /carriers", c.CarrierWire, "shipping/carriers", (m) => m.getAll());
await bothWays("GET /carrier_services", c.CarrierServiceWire, "shipping/services", (m) => m.getAll());
await bothWays("GET /spots/spot_prices", c.SpotPriceWire, "spots", (m) => m.getAll());
await bothWays("GET /rates", c.RateWire, "rates", (m) => m.getAllRates());
await bothWays("GET /reviews (admin)", c.ReviewWire, "reviews", (m) => m.getAllReviews());
await bothWays("GET /leads", c.LeadWire, "leads", (m) => m.getAllLeads());
await bothWays("GET /suppliers", c.SupplierWire, "suppliers", (m) => m.getAllSuppliers());
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
await bothWays("GET /addresses", c.AddressWire, "addresses", (m) =>
  addressUser ? m.list(addressUser) : []
);

// The other renaming read: media.images stores `checksum` and the wire calls it
// `checksum_sha`.
// Both shapes, as with products: the repos return media.images' own name and
// the adapter converts down to what the frontend reads.
await bothWays("GET /images", c.ImageWireNext, "media", (m) => m.getTestImages());
await bothWays("GET /images (legacy wire)", c.ImageWire, "media", async (m) =>
  mediaWire.toLegacy(await m.getTestImages())
);
add("GET /users", c.UserWire, () => users.getAllUsers());

// The catalogue. The other feature that had no contract, and one the frontend
// leans on hardest - every price on the site is derived from these numbers.
// getSellProducts returns rows getAllProducts does not, because a sell-only
// product has no slug, so both are checked rather than assuming one covers the
// other.
// Two shapes now, and both are checked.
//
// The repos return BullionWire - products.bullion's own names - because that is
// the internal truth from here on. features/products/wire.js converts it down
// to ProductWire, which is what the frontend reads, and PRODUCTS_WIRE decides
// which one leaves the API.
//
// Checking the adapter's OUTPUT against the legacy contract is the point: it is
// what proves the frontend still gets exactly what it got before, and it keeps
// working as a regression test right up until the adapter is deleted.
await bothWays("GET /products", c.BullionWire, "products", (m) => m.getAllProducts());
await bothWays("GET /products (sell)", c.BullionWire, "products", (m) => m.getSellProducts());
await bothWays("GET /products (legacy wire)", c.ProductWire, "products", async (m) =>
  (await m.getAllProducts()).map(toLegacyShape)
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
  for (const row of list) {
    // Contracts describe the wire, so compare what JSON serialisation produces.
    const result = schema.safeParse(JSON.parse(JSON.stringify(row)));
    if (result.success) continue;
    for (const i of result.error.issues) {
      const key = `${i.path.join(".") || "(root)"}: ${i.message}`;
      issues.set(key, (issues.get(key) ?? 0) + 1);
    }
  }

  if (issues.size) failures.push({ name, issues, count: list.length });
  else {
    pass++;
    console.log(`  ok    ${name}  (${list.length} rows)`);
  }
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
console.log(`${pass} endpoint shape(s) match, ${failures.length} diverge`);
if (failures.length) process.exitCode = 1;
await pool.end();
