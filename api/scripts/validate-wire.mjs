// Parses real API responses through the wire contracts.
//
// The generated table schemas are true by construction. The wire schemas are
// not: they are hand-composed to describe what each endpoint actually returns,
// and that claim is only worth something if it is checked against the real
// thing. This calls the repo functions the routes call and parses their output.
//
// Read-only.
//
//   pnpm --filter @dorado/api validate:wire
import "dotenv/config";
import pool from "#db";
import * as c from "@dorado/contracts";

const cases = [];
const add = (name, schema, load, many = true) =>
  cases.push({ name, schema, load, many });

const spots = await import("#features/spots/repo.js");
const rates = await import("#features/rates/repo.js");
const reviews = await import("#features/reviews/repo.js");
const leads = await import("#features/leads/repo.js");
const suppliers = await import("#features/suppliers/repo.js");
const carriers = await import("#features/shipping/carriers/repo.js");
const services = await import("#features/shipping/services/repo.js");
const users = await import("#features/users/repo.js");
const po = await import("#features/purchase-orders/repo.js");

add("GET /spots/spot_prices", c.SpotPriceWire, () => spots.getAll());
add("GET /rates", c.RateWire, () => rates.getAllRates());
add("GET /reviews (admin)", c.ReviewWire, () => reviews.getAllReviews());
add("GET /reviews (public)", c.ReviewWire, () => reviews.getPublicReviews());
add("GET /leads", c.LeadWire, () => leads.getAllLeads());
add("GET /suppliers", c.SupplierWire, () => suppliers.getAllSuppliers?.() ?? []);
add("GET /carriers", c.CarrierWire, () => carriers.getAll());
add("GET /carrier_services", c.CarrierServiceWire, () => services.getAll());
add("GET /users", c.UserWire, () => users.getAllUsers());

// Nested shapes, taken off a real order.
const orders = await po.getAll();
add("order.payout", c.PayoutOnOrder, () => orders.map((o) => o.payout).filter((p) => p?.id));
add("order.shipment", c.ShipmentOnOrder, () => orders.map((o) => o.shipment).filter((s) => s?.id));
add("order.user", c.UserOnOrder, () => orders.map((o) => o.user).filter((u) => u?.user_id));

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
