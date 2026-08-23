// Proves 029_genesis_backfill.sql actually moves the data across.
//
// Against dev the backfill is a no-op - every insert conflicts with a row that
// is already there - so applying it here says nothing about whether it works.
// The only real test is to run it into empty tables.
//
// So that is what this does, in the same way verify-genesis does: build the
// whole schema under renamed schemas inside a transaction, run the backfill
// into it, and compare what lands against what the live tables hold, row for
// row. Then run the backfill a second time to prove re-running changes
// nothing. Then roll back, so none of it survives.
//
// exchange is only ever read, by this script and by the migration it checks.
//
//   node scripts/verify-backfill.mjs
//
// Exits non-zero on any difference.
import "#env";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pool from "#db";

const PREFIX = "zz_backfill_";
const SCHEMAS = [
  "auth", "fulfillments", "leads", "media", "metals", "orders",
  "organizations", "payments", "places", "products", "rates",
  "refiners", "reviews", "shipping", "spots", "tax",
];

// Only the new schemas are renamed. exchange must keep pointing at the real
// data, which is the whole point.
const rename = (sql) =>
  SCHEMAS.reduce((acc, s) => acc.replace(new RegExp(`\\b${s}\\.`, "g"), `${PREFIX}${s}.`), sql);

// How to compare a backfilled table against the live one.
//
// `key` is the ordering, `cols` the values that must match. Where the new
// schema generates an id - an organization is a new object, not the supplier it
// came from - that id is deliberately not compared; what is compared is that
// the rows it links are the right ones. Anything referencing an organization
// is checked through its type and name rather than its id, for the same reason.
const TABLES = [
  {
    // Seeded by 055 from a Stripe export rather than derived from exchange -
    // exchange has no record of most of this, which is the whole reason the
    // table exists. imported_at is excluded: it defaults to now() and so
    // differs between the real table and the rebuilt one by construction.
    name: "payments.stripe_charges",
    key: "payment_intent_id",
    cols: "payment_intent_id, charge_id, created_at, amount, amount_refunded, fee, currency, captured, status, refunded_at, payment_source_type, stripe_customer_id, livemode",
  },
  { name: "metals.metals", key: "id", cols: "id, name" },
  { name: "spots.spots", key: "metal_id", cols: "metal_id, ask, bid, percent_change, dollar_change" },
  {
    name: "media.images",
    key: "id",
    cols: "id, bucket, mime_type, size_bytes, width, height, checksum, metadata, path, filename, user_id, created_at",
  },
  {
    name: "organizations.organizations",
    key: "type, name",
    cols: "type, name, email, phone, website, description, enabled, created_at, updated_at",
  },
  {
    name: "refiners.spots",
    key: "id",
    // refiner_id and pool_oz_deducted are excluded: exchange has no source for
    // either. The first was never recorded, and the second lives on the order.
    cols: "id, order_id, metal_id, ask, bid, scrap_percentage, bullion_percentage",
  },
  {
    name: "refiners.items",
    key: "order_item_id",
    // refiner_id is excluded on purpose: exchange has never recorded which
    // refiner a line went to, so it cannot be derived. It is preserved where a
    // row already carries one and left null otherwise - the same decision
    // already taken for orders.orders.refinery_id.
    cols: "order_item_id, bullion_id, metal_id, pre_melt, post_melt, purity, content, premium, quantity, unit",
  },
  {
    name: "payments.details",
    key: "id",
    // routing_number and account_number are excluded because the backfill
    // deliberately does not write them - they are encrypted separately by
    // scripts/encrypt-payout-details.mjs. Comparing them would assert that a
    // rebuild reproduces plaintext bank details, which is the opposite of what
    // this migration is for.
    cols: "id, user_id, method_id, account_holder, bank_name, account_type, email_to",
  },
  {
    name: "payments.ledger",
    key: "id",
    cols: "id, user_id, type, order_id, amount, occurred_at",
  },
  {
    name: "refiners.refiners",
    key: "id",
    cols: "id, logo, (SELECT o.type || '/' || o.name FROM $S$organizations.organizations o WHERE o.id = t.organization_id)",
  },
  {
    name: "shipping.carriers",
    key: "id",
    cols: "id, logo, (SELECT o.type || '/' || o.name FROM $S$organizations.organizations o WHERE o.id = t.organization_id)",
  },
  {
    name: "products.mints",
    key: "id",
    cols: "id, name, type, country, created_at, updated_at, image_id, (SELECT o.type || '/' || o.name FROM $S$organizations.organizations o WHERE o.id = t.organization_id)",
  },
  {
    name: "products.bullion",
    key: "id",
    cols: `id, metal_id, mint_id, supplier_id, name, description, type, bid_premium,
           ask_premium, display, homepage_display, sell_display, legal_tender,
           domestic_tender, is_generic, content, gross, purity, variant_group,
           variant_label, shadow_offset, slug, filter_category, image_front,
           image_back, stock, quantity, created_by, updated_by, created_by_id,
           updated_by_id, created_at, updated_at`,
  },
  {
    name: "leads.leads",
    key: "id",
    cols: `id, name, phone, email, created_at, updated_at, last_contacted, converted,
           contacted, responded, created_by, updated_by, notes, contact, priority,
           created_by_id, updated_by_id`,
  },
  {
    name: "rates.rates",
    key: "id",
    cols: `id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct, created_at,
           updated_at, created_by, updated_by, created_by_id, updated_by_id`,
  },
  {
    name: "reviews.reviews",
    key: "id",
    // user_id is deliberately not compared. dev carries a value from January
    // that cannot be derived from exchange - two accounts share the name every
    // review was left under - so the backfill leaves it null on purpose.
    cols: `id, order_id, name, review_text, rating, hidden, created_at,
           updated_at, created_by, updated_by, created_by_id, updated_by_id`,
  },
  {
    name: "tax.sales_tax_rules",
    key: "id",
    cols: `id, state_code, metal_category::text, product_type::text, min_price, max_price,
           purity_min, purity_max, aggregate_min, aggregate_max, markup_min_pct,
           markup_max_pct, tax_rate, weight_min, weight_max, is_domestic, is_legal_tender`,
  },
  { name: "tax.sales_tax", key: "id", cols: "id, state, reached_nexus, amount_owed, last_remitted" },
  {
    name: "shipping.shipments",
    key: "id",
    // The service and package are referenced by id here and named as text in
    // exchange, so they are compared through their names instead.
    cols: `id, tracking_number, delivered_at, shipped_at, est_delivery, label_type,
           direction::text, insured, declared_value, cost, shipping_status,
           pickup_type, created_at,
           (SELECT sv.name FROM $S$shipping.services sv WHERE sv.id = t.carrier_service_id),
           (SELECT pk.label FROM $S$shipping.packages pk WHERE pk.id = t.package_id)`,
  },
  {
    name: "fulfillments.fulfillments",
    key: "order_id",
    // The id is generated, so what is compared is the order, the method by name
    // and direction, and the status.
    //
    // Timestamps are not compared. dev's are when January wrote the row - all
    // 2026-01-13 - where a rebuild takes the shipment's, which is when the
    // fulfillment actually happened. The rebuild's answer is the better one and
    // it is not the one dev holds.
    //
    // One order is excluded. dev marks 1f3e9efe as APPOINTMENT/SCHEDULED while
    // that same order has a DropShip shipment, and fulfillments_order_uniq
    // allows only one fulfillment per order - so the two statements contradict
    // each other. A rebuild derives DROPSHIP from the shipment, which is what
    // the shipment says happened. dev's row is a January artifact, and the one
    // fulfillment with no shipment link.
    where: "t.order_id <> '1f3e9efe-21a5-4dc4-a7a5-89a2dcf0f3b8'",
    cols: `order_id, status,
           (SELECT m.type || '/' || m.direction FROM $S$fulfillments.methods m WHERE m.id = t.method_id)`,
  },
  {
    name: "fulfillments.shipments",
    key: "shipment_id",
    // Locations compared by type rather than id: the mapping keys on the type,
    // so that is what has to survive a rebuild.
    cols: `shipment_id,
           (SELECT l.type FROM $S$places.locations l WHERE l.id = t.recipient_location_id),
           (SELECT l.type FROM $S$places.locations l WHERE l.id = t.shipper_location_id)`,
  },
  {
    name: "shipping.tracking",
    key: "id",
    // dev holds 9 events with no counterpart in dev's exchange.tracking_events,
    // belonging to 3 shipments. Neither the events nor those shipments exist in
    // production, and production holds 525 events against dev's 72 - they are
    // artifacts of the January work against a dev database. A rebuild from
    // exchange cannot produce them and should not, so they are excluded rather
    // than treated as a gap.
    where: "EXISTS (SELECT 1 FROM exchange.tracking_events e WHERE e.id = t.id)",
    cols: "id, shipment_id, status, location, time",
  },
  {
    name: "places.addresses",
    key: "id",
    // Only the address book. Snapshots are created by the orders backfill with
    // fresh ids, and the shop addresses come from the seed.
    where: "EXISTS (SELECT 1 FROM exchange.addresses e WHERE e.id = t.id)",
    cols: `id, line_1, line_2, city, state, country, zip, country_code,
           phone_number, created_at, updated_at, is_valid, is_residential`,
  },
  {
    name: "places.user_addresses",
    key: "user_id, address_id",
    cols: "user_id, address_id, label, default_shipping, default_billing",
  },

  // orders. The ids that are not carried over from exchange - offers,
  // transactions, spots and the address link all get fresh ones - are compared
  // through the order they belong to instead.
  {
    name: "orders.orders",
    key: "direction, number",
    // refinery_id is not compared. Every purchase order in dev points at
    // Elemetal, but exchange has no column saying so, so a rebuild leaves it
    // null rather than asserting it of orders it knows nothing about. Needs a
    // decision - see FOLLOWUPS.
    cols: `id, user_id, direction::text, status, number, notes,
           review_created, order_sent, tracking_updated,
           created_by, updated_by, created_at, updated_at`,
  },
  {
    name: "orders.offers",
    key: "order_id",
    cols: `order_id, status, offer_status, notes, spots_locked, offer_expiration,
           offer_sent_at, num_rejections, offer_amount, created_by, updated_by,
           created_at, updated_at`,
  },
  {
    name: "orders.transactions",
    key: "order_id",
    cols: `order_id, total, items, shipping, surcharge, sales_tax, funds,
           refiner_fee, base_total, post_charges_amount, subject_to_charges_amount,
           used_funds, waive_shipping_fee, waive_payout_fee, shipping_paid,
           shipping_fee_actual, pool_remediation, pool_oz_deducted,
           created_by, updated_by, created_at, updated_at`,
  },
  {
    name: "orders.items",
    key: "id",
    // purity is not compared. A bullion line records what the product weighed
    // when it was ordered, and three products have been edited since; the
    // historical value is not in exchange, so a rebuild can only take the
    // current one.
    // The four assay columns moved to refiners.items in 065 and are compared
    // there. What is left is what the customer declared plus the price.
    cols: `id, order_id, bullion_id, metal_id, pre_melt, post_melt, content,
           premium, quantity, confirmed, sales_tax_charged, unit,
           price, bid_premium`,
  },
  {
    name: "orders.spots",
    key: "order_id, metal_id",
    cols: `order_id, metal_id, ask, bid, scrap_percentage, bullion_percentage,
           created_at, updated_at`,
  },
  {
    name: "orders.addresses",
    key: "order_id",
    // The address is a snapshot with a fresh id, so what is compared is the
    // address it holds, not which row holds it.
    cols: `order_id, (SELECT a.line_1 || '|' || a.city || '|' || a.state || '|' || a.zip
                      FROM $S$places.addresses a WHERE a.id = t.address_id)`,
  },
];

// Tables in the new schema that are deliberately not rebuilt from exchange,
// with the reason. Everything else that holds rows must be registered in TABLES
// above, or the from-empty check silently does not cover it.
//
// This list exists because `addresses` was migrated - repo split, dual-write,
// tests, clean read diff - and nothing ever copied its data. On a database
// built from exchange every customer's saved address list would have been
// empty. Nothing noticed, because against dev the rows were already there from
// January. A registration is what makes the check cover a table; without one it
// passes by not looking.
const NOT_REBUILT = {
  "auth.users": "backfilled by 029 but compared per-column there, not row-wise",
  "auth.employees": "seed data, no exchange source",
  "auth.account": "better-auth owns these tables; auth is not migrated",
  "auth.sessions": "same",
  "auth.verification": "same",
  "payments.details": "payments is a different model; not migrated",
  "payments.methods": "seed data, no exchange source",
  "payments.intents": "payments is a different model; not migrated",
  "payments.attempts": "same",
  "payments.settlements": "same",
  "fulfillments.methods": "seed data, no exchange source",
  "places.locations": "seed data, no exchange source",
  "places.location_hours": "seed data, no exchange source",
  "refiners.refiners": "compared through refiners.exchange_compat",

  // A cart is transient. Jacob: "It's not data that we NEED to keep." On dual
  // the next sync rewrites it in both schemas, so there is nothing to derive
  // and nothing a rebuild should produce.
  "checkout.checkouts": "cart contents are transient and deliberately not carried across",
  "checkout.items": "same",
  "shipping.services": "seed data",
  "shipping.packages": "seed data",
  "organizations.organizations": "registered under its own entry",
};

const client = await pool.connect();
let failures = 0;
const note = (m) => {
  failures++;
  console.log(`  DIFF  ${m}`);
};

// Renders a table as one text row per record, so two tables can be compared
// without caring how the driver would have parsed the values.
const rowsOf = async (schemaPrefix, t) => {
  const cols = t.cols.replaceAll("$S$", schemaPrefix);
  const { rows } = await client.query(
    `SELECT (t.*)::text AS whole FROM (
       SELECT ${cols} FROM ${schemaPrefix}${t.name} t
       ${t.where ? `WHERE ${t.where}` : ""}
       ORDER BY ${t.key}
     ) t`
  );
  return rows.map((r) => r.whole);
};

try {
  const ddl = execFileSync(
    process.execPath,
    [path.join(import.meta.dirname, "dump-schema.mjs"), "--stdout", "--prefix", PREFIX],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );

  // Every backfill and seed after the genesis baseline, in filename order.
  // Picked up by name so a new one is covered the moment it is added, rather
  // than the day someone remembers to list it here. Corrections are not
  // included: they repair drift in dev's copy, and a database built from
  // exchange has none of it to repair.
  //
  // The seed is included because it is the other half of what a fresh database
  // needs: the backfills bring across what exchange holds, and the seed brings
  // what it never did.
  const dir = path.join(import.meta.dirname, "..", "migrations");
  const backfillFiles = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (f.includes("backfill") || f.includes("seed")) &&
        f.slice(0, 3) > "028"
    )
    .sort();

  if (!backfillFiles.length) {
    console.error("no backfill migrations found");
    process.exit(1);
  }
  console.log(`backfills: ${backfillFiles.join(", ")}`);

  const backfill = backfillFiles
    .map((f) => rename(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n;\n");

  await client.query("BEGIN");

  console.log("building an empty schema...");
  await client.query(ddl);

  const empty = await client.query(
    `SELECT count(*)::int n FROM ${PREFIX}products.bullion`
  );
  if (empty.rows[0].n !== 0) {
    console.error("the scratch schema is not empty; the comparison would be meaningless");
    process.exit(1);
  }

  console.log("backfilling it from exchange...");
  await client.query(backfill);

  for (const t of TABLES) {
    const [live, built] = [await rowsOf("", t), await rowsOf(PREFIX, t)];
    if (live.length !== built.length) {
      note(`${t.name}: dev has ${live.length} rows, the backfill produced ${built.length}`);
    }
    const missing = live.filter((r) => !built.includes(r));
    const extra = built.filter((r) => !live.includes(r));
    for (const r of missing.slice(0, 3)) note(`${t.name}: backfill did not produce  ${r}`);
    for (const r of extra.slice(0, 3)) note(`${t.name}: backfill produced extra    ${r}`);
    if (missing.length > 3 || extra.length > 3) {
      note(`${t.name}: ...and ${missing.length - 3 + extra.length - 3} more`);
    }
    if (live.length === built.length && !missing.length && !extra.length) {
      console.log(`  ok    ${t.name.padEnd(30)} ${built.length} rows`);
    }
  }

  // Every populated table in the new schema must be either registered above or
  // explicitly declared as not rebuilt. A table that is neither is the
  // addresses bug again: migrated in code, never copied, and nothing checking.
  const { rows: populated } = await client.query(
    `SELECT n.nspname || '.' || c.relname AS name
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = ANY($1)
     ORDER BY 1`,
    [SCHEMAS]
  );
  const registered = new Set(TABLES.map((t) => t.name));
  for (const { name } of populated) {
    const { rows: [{ n }] } = await client.query(`SELECT count(*)::int n FROM ${name}`);
    if (n === 0) continue;
    if (registered.has(name) || NOT_REBUILT[name]) continue;
    note(
      `${name} holds ${n} rows, is not registered in TABLES, and is not declared in NOT_REBUILT - ` +
        `so nothing checks that it can be rebuilt from exchange`
    );
  }

  // Re-running must add nothing and change nothing. A backfill that is not
  // idempotent is one you can only ever run once, and you find that out at the
  // worst possible moment.
  console.log("\nre-running to confirm it is idempotent...");
  // One connection, so these run in sequence - a client cannot have two
  // queries in flight at once.
  const before = [];
  for (const t of TABLES) before.push(await rowsOf(PREFIX, t));
  await client.query(backfill);
  const after = [];
  for (const t of TABLES) after.push(await rowsOf(PREFIX, t));
  TABLES.forEach((t, i) => {
    if (before[i].length !== after[i].length) {
      note(`${t.name}: re-running changed the row count, ${before[i].length} -> ${after[i].length}`);
    } else if (before[i].join("\n") !== after[i].join("\n")) {
      note(`${t.name}: re-running changed the contents`);
    }
  });

  // And the guard: once the new schema holds a row exchange does not, the
  // backfill must refuse rather than run beside it.
  console.log("confirming it refuses once exchange is no longer authoritative...");
  await client.query(
    `INSERT INTO ${PREFIX}leads.leads (id, name, created_at, updated_at, converted, contacted, responded)
     VALUES (gen_random_uuid(), 'written after the switch was promoted', now(), now(), false, false, false)`
  );
  let refused = false;
  try {
    await client.query(backfill);
  } catch (err) {
    refused = /refusing to backfill/.test(err.message);
    if (!refused) throw err;
  }
  if (!refused) note("the backfill ran even though the new schema held a row exchange does not");
  else console.log("  ok    refused, naming leads.leads");

  console.log(failures ? `\n${failures} difference(s)` : "\nthe backfill reproduces dev exactly");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}

process.exit(failures ? 1 : 0);
