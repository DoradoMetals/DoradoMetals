// Which populated columns in exchange have nowhere to go in the new schema.
//
// Written after orders turned out to be missing twenty-one columns of live
// data, found one repo function at a time. Row counts had matched, the shapes
// looked plausible, and the gaps only showed up when something tried to read a
// column that was not there. That is far too late, and doing it by hand for the
// thirteen features still to move would find the same thing just as slowly.
//
// So: for each source table, every column that holds a value in at least one
// row, checked against every table the feature maps onto. A column counts as
// having a home if some target table has one of the same name, or a rename is
// declared below. Anything left is either a rename nobody wrote down or data
// with no destination.
//
// It cannot know whether a mapping is *correct* - only whether one exists. It
// is a floor, not a ceiling.
//
// Read-only.
//
//   node scripts/audit-coverage.mjs            every feature
//   node scripts/audit-coverage.mjs orders     one
import "#env";
import pool from "#db";

// source table -> the tables its columns are allowed to land in
const FEATURES = {
  leads: { "exchange.leads": ["leads.leads"] },
  rates: { "exchange.rates": ["rates.rates"] },
  reviews: { "exchange.reviews": ["reviews.reviews"] },
  tax: {
    "exchange.sales_tax_rules": ["tax.sales_tax_rules"],
    "exchange.state_sales_tax": ["tax.sales_tax"],
  },
  metals: { "exchange.metals": ["metals.metals", "spots.spots"] },
  media: { "exchange.images": ["media.images"] },
  suppliers: { "exchange.suppliers": ["refiners.refiners", "organizations.organizations"] },
  carriers: { "exchange.carriers": ["shipping.carriers", "organizations.organizations"] },
  mints: { "exchange.mints": ["products.mints", "organizations.organizations"] },
  products: { "exchange.products": ["products.bullion"] },
  orders: {
    "exchange.purchase_orders": ["orders.orders", "orders.offers", "orders.transactions"],
    "exchange.sales_orders": ["orders.orders", "orders.transactions"],
    "exchange.purchase_order_items": ["orders.items"],
    "exchange.sales_order_items": ["orders.items"],
    "exchange.scrap": ["orders.items"],
    "exchange.order_metals": ["orders.spots"],
    "exchange.addresses": ["places.addresses", "orders.addresses"],
  },
  shipping: {
    "exchange.shipments": ["shipping.shipments", "fulfillments.shipments"],
    "exchange.tracking_events": ["shipping.tracking"],
    "exchange.carrier_pickups": ["shipping.pickups", "fulfillments.pickups"],
  },
  payments: {
    "exchange.payouts": ["payments.details", "payments.methods"],
    "exchange.payment_intents": ["payments.intents", "payments.attempts", "payments.settlements"],
  },
  refiners: { "exchange.refiner_metals": ["refiners.spots", "refiners.items"] },
  users: { "exchange.users": ["auth.users"], "exchange.session": ["auth.sessions"] },
};

// Columns that moved under a different name. Recorded here so a rename is not
// reported as a loss - and so the renames are written down somewhere.
const RENAMES = {
  "exchange.products": { product_name: "name", product_description: "description", product_type: "type" },
  "exchange.images": { checksum_sha256: "checksum" },
  "exchange.metals": { type: "name", ask_spot: "ask", bid_spot: "bid" },
  "exchange.suppliers": { is_active: "enabled" },
  "exchange.carriers": { is_active: "enabled" },
  "exchange.purchase_orders": {
    purchase_order_status: "status", order_number: "number", offer_notes: "notes",
    total_price: "offer_amount", offer_expires_at: "offer_expiration", address_id: "-",
  },
  "exchange.sales_orders": {
    sales_order_status: "status", order_number: "number", supplier_id: "refinery_id",
    order_total: "total", item_total: "items", shipping_cost: "shipping",
    charges_amount: "surcharge", pre_charges_amount: "funds", address_id: "-",
  },
  "exchange.purchase_order_items": { purchase_order_id: "order_id", product_id: "bullion_id", scrap_id: "-" },
  "exchange.sales_order_items": { sales_order_id: "order_id", product_id: "bullion_id", sales_tax_rate: "sales_tax_charged" },
  "exchange.scrap": { gross_unit: "unit", gem_id: "-" },
  "exchange.order_metals": { type: "metal_id", ask_spot: "ask", bid_spot: "bid", purchase_order_id: "order_id", sales_order_id: "order_id" },
  "exchange.refiner_metals": { type: "metal_id", ask_spot: "ask", bid_spot: "bid", purchase_order_id: "order_id", sales_order_id: "order_id" },
  "exchange.addresses": { user_id: "-", name: "-", is_default: "-" },
  // A shipment keeps its id but loses its direct link to the order: that moves
  // to fulfillments.fulfillments.order_id, one row per order. Verified against
  // the data - all 17 copied shipments agree on the renamed columns.
  "exchange.shipments": {
    estimated_delivery: "est_delivery",
    shipping_label: "label",
    net_charge: "cost",
    type: "direction",
    purchase_order_id: "-",
    sales_order_id: "-",
  },
  "exchange.tracking_events": { scan_time: "time" },
  // payments is not a reshaping of exchange - it is a different model with no
  // shared ids and a different granularity, so these are not renames and are
  // deliberately not declared as such. Left reported so the gap stays visible.
  "exchange.carrier_pickups": { order_id: "-", carrier: "-", pickup_requested_at: "requested_at", pickup_status: "status" },
};

// Columns deliberately not carried across, with the reason. Distinct from a
// rename: these hold data that was reviewed and judged not worth moving. Listed
// so the report shows real gaps rather than decisions already taken - a report
// that cries wolf is one people stop reading.
const DELIBERATE = {
  "exchange.metals.scrap_percentage":
    "rate tiering moved to rates.rates, which supersedes a single percentage per metal",
  "exchange.metals.bullion_percentage": "same",
};

// Columns whose destination exists but is itself blocked on a decision. They
// are real gaps, not decisions taken, so they are reported - but reported as
// blocked, because adding a column for them now would prejudge the answer.
const BLOCKED = {
  "exchange.shipments.service_type": "routes through shipping.services",
  "exchange.shipments.package": "routes through shipping.packages",
  "exchange.shipments.carrier_id": "reachable only via shipping.services",
};

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const only = process.argv[2];
const features = only ? { [only]: FEATURES[only] } : FEATURES;
if (only && !FEATURES[only]) {
  console.error(`unknown feature: ${only}\nknown: ${Object.keys(FEATURES).join(", ")}`);
  process.exit(1);
}

let gaps = 0;

for (const [feature, sources] of Object.entries(features)) {
  const lines = [];

  for (const [source, targets] of Object.entries(sources)) {
    const [ss, st] = source.split(".");
    const cols = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [ss, st]
    );
    if (!cols.length) {
      lines.push(`   ${source} does not exist`);
      continue;
    }

    const available = new Set();
    for (const t of targets) {
      const [ts, tt] = t.split(".");
      for (const c of await q(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [ts, tt]
      )) {
        available.add(c.column_name);
      }
    }

    const renames = RENAMES[source] ?? {};

    for (const { column_name: col } of cols) {
      const mapped = renames[col];
      if (mapped === "-") continue;
      if (available.has(mapped ?? col)) continue;
      if (DELIBERATE[`${source}.${col}`]) continue;

      // Only report it if it actually holds something. A column that is null
      // on every row is a question for whoever owns the feature, not a
      // blocker for the migration.
      const [{ n, total }] = await q(
        `SELECT count(*) FILTER (WHERE "${col}" IS NOT NULL)::int n, count(*)::int total FROM "${ss}"."${st}"`
      );
      if (n === 0) continue;

      const blocked = BLOCKED[`${source}.${col}`];
      gaps++;
      lines.push(
        `   ${source}.${col}`.padEnd(52) +
          `${n} of ${total} rows populated` +
          (blocked ? `   BLOCKED - ${blocked}` : "")
      );
    }
  }

  if (lines.length) {
    console.log(`\n=== ${feature} ===`);
    console.log(lines.join("\n"));
  }
}

console.log(
  gaps
    ? `\n${gaps} populated column(s) with no home in the new schema`
    : "\nevery populated column has somewhere to go"
);

await pool.end();
process.exit(0);
