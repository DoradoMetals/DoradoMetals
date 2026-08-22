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
    // The business's own organization has no source in exchange - it is seed
    // data, not a reshaping of anything - so the backfill does not produce it
    // and this comparison does not expect it. It is carried with the rest of
    // the seed data, alongside places.locations, which is what references it.
    where: "type <> 'DORADO'",
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
    cols: `id, order_id, bullion_id, metal_id, pre_melt, post_melt, content,
           premium, quantity, confirmed, sales_tax_charged, unit,
           price, refiner_premium, bid_premium, purity_actual, post_melt_actual,
           content_actual`,
  },
  { name: "orders.spots", key: "order_id, metal_id", cols: "order_id, metal_id, ask, bid" },
  {
    name: "orders.addresses",
    key: "order_id",
    // The address is a snapshot with a fresh id, so what is compared is the
    // address it holds, not which row holds it.
    cols: `order_id, (SELECT a.line_1 || '|' || a.city || '|' || a.state || '|' || a.zip
                      FROM $S$places.addresses a WHERE a.id = t.address_id)`,
  },
];

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

  // Every backfill after the genesis baseline, in filename order. Picked up by
  // name so a new one is covered by this check the moment it is added, rather
  // than the day someone remembers to list it here. Corrections are not
  // included: they repair drift in dev's copy, and a database built from
  // exchange has none of it to repair.
  const dir = path.join(import.meta.dirname, "..", "migrations");
  const backfillFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && f.includes("backfill") && f.slice(0, 3) > "028")
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
