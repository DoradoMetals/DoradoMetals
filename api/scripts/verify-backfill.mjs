import "#env";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

const PREFIX = "zz_backfill_";
const SCHEMAS = [
  "auth", "fulfillments", "leads", "media", "metals", "orders",
  "organizations", "payments", "places", "products", "rates",
  "refiners", "reviews", "shipping", "spots", "tax",
];

const rename = (sql) =>
  SCHEMAS.reduce((acc, s) => acc.replace(new RegExp(`\\b${s}\\.`, "g"), `${PREFIX}${s}.`), sql);

const TABLES = [
  {
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
    cols: "id, order_id, metal_id, ask, bid, scrap_percentage, bullion_percentage",
  },
  {
    name: "refiners.items",
    key: "order_item_id",
    cols: "order_item_id, bullion_id, metal_id, pre_melt, post_melt, purity, content, premium, quantity, unit",
  },
  {
    name: "payments.intents",
    key: "id",
    cols: "id, order_id, method_id, amount_expected, status, session_id, user_id, type",
  },
  {
    name: "payments.attempts",
    key: "id",
    cols: "id, intent_id, method_id, provider, provider_ref, amount, status",
  },
  {
    name: "payments.settlements",
    key: "id",
    cols: "id, attempt_id, settled_amount, provider, provider_ref",
  },
  {
    name: "payments.details",
    key: "id",
    cols: "id, user_id, method_id, account_holder, bank_name, account_type, email_to, provider, provider_ref, last_four, card_brand",
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
           ask_premium, display, homepage_display, legal_tender,
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
    cols: `id, tracking_number, delivered_at, shipped_at, est_delivery, label_type,
           direction::text, insured, declared_value, cost, shipping_status,
           pickup_type, created_at,
           (SELECT sv.name FROM $S$shipping.services sv WHERE sv.id = t.carrier_service_id),
           (SELECT pk.label FROM $S$shipping.packages pk WHERE pk.id = t.package_id)`,
  },
  {
    name: "fulfillments.fulfillments",
    key: "order_id",
    where: "t.order_id <> '1f3e9efe-21a5-4dc4-a7a5-89a2dcf0f3b8'",
    cols: `order_id, status,
           (SELECT m.type || '/' || m.direction FROM $S$fulfillments.methods m WHERE m.id = t.method_id)`,
  },
  {
    name: "fulfillments.shipments",
    key: "shipment_id",
    cols: `shipment_id,
           (SELECT l.type FROM $S$places.locations l WHERE l.id = t.recipient_location_id),
           (SELECT l.type FROM $S$places.locations l WHERE l.id = t.shipper_location_id)`,
  },
  {
    name: "shipping.tracking",
    key: "id",
    where: "EXISTS (SELECT 1 FROM exchange.tracking_events e WHERE e.id = t.id)",
    cols: "id, shipment_id, status, location, time",
  },
  {
    name: "places.addresses",
    key: "id",
    where: "EXISTS (SELECT 1 FROM exchange.addresses e WHERE e.id = t.id)",
    cols: `id, line_1, line_2, city, state, country, zip, country_code,
           phone_number, created_at, updated_at, is_valid, is_residential`,
  },
  {
    name: "places.user_addresses",
    key: "user_id, address_id",
    cols: "user_id, address_id, label, default_shipping, default_billing",
  },

  {
    name: "orders.orders",
    key: "direction, number",
    cols: `id, user_id, direction::text, status, number, notes,
           review_created, order_sent, tracking_updated, spots_locked,
           created_by, updated_by, created_at, updated_at`,
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
    cols: `id, order_id, bullion_id, metal_id, pre_melt, post_melt, content,
           premium, quantity, confirmed, sales_tax_charged, unit,
           price`,
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
    cols: `order_id, (SELECT a.line_1 || '|' || a.city || '|' || a.state || '|' || a.zip
                      FROM $S$places.addresses a WHERE a.id = t.address_id)`,
  },
];

const NOT_REBUILT = {
  "refiners.orders": "created and seeded by 093/094/096 from the ledger; invariant pinned by refiner-edits.test.ts",
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

  "fulfillments.pickups": "no exchange source: exchange never recorded an in-person pickup",
  "fulfillments.directs": "no exchange source: exchange never recorded a walk-in or appointment",
  "places.locations": "seed data, no exchange source",
  "places.location_hours": "seed data, no exchange source",
  "refiners.refiners": "compared through refiners.exchange_compat",

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

  console.log("\nre-running to confirm it is idempotent...");
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
