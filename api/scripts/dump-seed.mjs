import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

const TABLES = [
  ["organizations", "organizations", "type = 'DORADO'"],
  ["places", "addresses", "id IN (SELECT address_id FROM places.locations WHERE address_id IS NOT NULL)"],
  ["places", "locations", null],
  ["places", "location_hours", null],
  // carrier_id IS NOT NULL: the carrier-less "offered" service and package rows
  // are created by 110 and 112, which run long after this file. Dumping them
  // here would seed them three migrations early and count them as reference
  // data that has always existed.
  ["shipping", "services", "carrier_id IS NOT NULL", "created by 110, not seeded here"],
  ["shipping", "packages", "carrier_id IS NOT NULL", "created by 112, not seeded here"],
  ["fulfillments", "methods", null],
  ["payments", "methods", null],
  ["auth", "employees", null],
];

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

// A reference is written as a LOOKUP BY NATURAL KEY, never as the literal id
// this dev database happens to hold. Production's January reference data is a
// separate creation with its own ids, so a literal would either dangle or
// point at the wrong row; the lookup lands on whichever row is already there.
const sq = (v) => `'${String(v).replace(/'/g, "''")}'`;
const eq = (col, v) => (v === null || v === undefined ? `${col} IS NULL` : `${col} = ${sq(v)}`);
// ORDER BY ... LIMIT 1, always. A natural key that identifies a row in THIS
// database need not identify one in production: places.addresses there holds
// every customer address as well as the business's own, and the rehearsal hit
// `more than one row returned by a subquery` on exactly that. Oldest-then-id
// is deterministic, and on a from-nothing build there is only ever one match.
const pick = (where, order) => ` ORDER BY ${order} LIMIT 1`;

const RESOLVE = {
  "places.locations.organization_id": async (id) => {
    const [org] = await q(
      "SELECT type, name FROM organizations.organizations WHERE id = $1",
      [id]
    );
    if (!org) return null;
    return `(SELECT id FROM organizations.organizations WHERE ${eq("type", org.type)} AND ${eq("name", org.name)}${pick(null, "created_at NULLS LAST, id")})`;
  },
  "places.locations.address_id": async (id) => {
    const [a] = await q(
      "SELECT line_1, line_2, city, state, zip FROM places.addresses WHERE id = $1",
      [id]
    );
    if (!a) return null;
    return (
      `(SELECT id FROM places.addresses WHERE ${eq("line_1", a.line_1)}` +
      ` AND line_2 IS NOT DISTINCT FROM ${a.line_2 === null ? "NULL" : sq(a.line_2)}` +
      ` AND ${eq("city", a.city)} AND ${eq("state", a.state)} AND ${eq("zip", a.zip)}` +
      `${pick(null, "created_at NULLS LAST, id")})`
    );
  },
  "places.location_hours.location_id": async (id) => {
    const [l] = await q("SELECT type, name FROM places.locations WHERE id = $1", [id]);
    if (!l) return null;
    return `(SELECT id FROM places.locations WHERE ${eq("type", l.type)} AND ${eq("name", l.name)}${pick(null, "id")})`;
  },
};

// THE FACT THAT IDENTIFIES THE ROW, per table. `ON CONFLICT (id)` only ever
// saw the id, so on a database already holding January's copies of these same
// facts under DIFFERENT ids every insert landed a duplicate - the UAT
// rehearsal measured places.locations going 3 -> 6 - or collided on a natural
// unique index and aborted the migration (shipping.services). Each insert is
// now guarded by NOT EXISTS on these columns, so the file yields exactly one
// of each fact wherever it is run.
const NATURAL = {
  "organizations.organizations": ["type", "name"],
  "places.addresses": ["line_1", "line_2", "city", "state", "zip"],
  "places.locations": ["type", "name"],
  "places.location_hours": ["location_id", "weekday"],
  "shipping.services": ["carrier_id", "name"],
  "shipping.packages": ["carrier_id", "label"],
  "fulfillments.methods": ["direction", "type", "label"],
  "payments.methods": ["direction", "type", "provider_value"],
  "auth.employees": ["user_id"],
};
const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s}"`);

function literal(v, type) {
  if (v === null || v === undefined) return `NULL::${type}`;
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'::${type}`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const items = v.map(
      (x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    );
    const arr = `{${items.join(",")}}`;
    return `'${arr.replace(/'/g, "''")}'::${type}`;
  }
  if (typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::${type}`;
  }
  return `'${String(v).replace(/'/g, "''")}'::${type}`;
}

const out = [];
const say = (s = "") => out.push(s);

say(`-- Reference data with no source in exchange.
--
-- Everything else in the new schema is derived: the backfills read exchange and
-- reshape it. These rows cannot be, because exchange has never held them. They
-- are facts about the business that were written straight into dev in January -
-- the organization the business itself is, its locations and their opening
-- hours, the fulfillment and payment methods offered, and who is an employee.
--
-- So they are carried across as literal values, which is the only way to move
-- something that has no source. The seed's own ids are kept, but nothing
-- DEPENDS on them any more: locations reference an organization and hours
-- reference a location, and each of those references is written as a lookup by
-- natural key, so the set hangs together against whichever copy of the fact the
-- target database already holds.
--
-- IDEMPOTENT BY NATURAL KEY, not by id (2026-09-06, prod-day fixes). On dev
-- this is a no-op; on an empty database it is the difference between a schema
-- that exists and a schema that works, since without payment and fulfillment
-- methods there is nothing for a customer to choose at checkout. On production,
-- which already holds January copies of these same facts under its OWN ids, it
-- is what keeps the file from seeding a second set: ON CONFLICT (id) saw only
-- the id and the UAT rehearsal watched places.locations go 3 -> 6, while
-- shipping.services collided on services_carrier_name_key and aborted. Each
-- insert now carries NOT EXISTS on the fact that identifies the row, and every
-- reference below is a lookup by that fact rather than a literal id, so a row
-- attaches to whichever copy is already there.
--
-- GENERATED by scripts/dump-seed.mjs. Regenerate rather than editing by hand.
--
-- exchange is untouched - it is not read here either, because there is nothing
-- in it to read.
`);

let total = 0;

for (const [schema, table, where, note] of TABLES) {
  const cols = await q(
    `SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
     FROM pg_attribute a
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [`${schema}.${table}`]
  );

  const rows = await q(
    `SELECT ${cols.map((c) => `${ident(c.column_name)}::text AS ${ident(c.column_name)}`).join(", ")}
     FROM ${ident(schema)}.${ident(table)} ${where ? `WHERE ${where}` : ""}
     ORDER BY id`
  );
  if (!rows.length) continue;
  total += rows.length;

  say(`-- ${schema}.${table} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
  if (where) {
    say(`-- Only ${where.replace(/'/g, "")}; ${note ?? "the rest are derived from exchange by 029"}.`);
  }
  const key = NATURAL[`${schema}.${table}`];
  if (!key) throw new Error(`${schema}.${table} has no natural key in NATURAL - an insert with no fact to key on cannot be idempotent`);
  for (const k of key) {
    if (!cols.some((c) => c.column_name === k)) {
      throw new Error(`${schema}.${table}: natural key column ${k} is not a column of the table`);
    }
  }
  const list = cols.map((c) => ident(c.column_name)).join(", ");
  say(`INSERT INTO ${ident(schema)}.${ident(table)} (${list})`);
  say(`SELECT ${cols.map((c) => `v.${ident(c.column_name)}`).join(", ")}`);
  say("FROM (VALUES");
  const rendered = [];
  for (const r of rows) {
    const values = [];
    for (const c of cols) {
      const resolver = RESOLVE[`${schema}.${table}.${c.column_name}`];
      const v = r[c.column_name];
      if (resolver && v != null) {
        const expr = await resolver(v);
        values.push(expr ?? literal(v, c.type));
      } else {
        values.push(literal(v, c.type));
      }
    }
    rendered.push("  (" + values.join(", ") + ")");
  }
  say(rendered.join(",\n"));
  say(`) AS v (${list})`);
  say(`WHERE NOT EXISTS (`);
  say(`  SELECT 1 FROM ${ident(schema)}.${ident(table)} t`);
  say(
    key
      .map((k, i) => `  ${i === 0 ? "WHERE" : "  AND"} t.${ident(k)} IS NOT DISTINCT FROM v.${ident(k)}`)
      .join("\n")
  );
  say(")");
  say("ON CONFLICT (id) DO NOTHING;");
  say();
}

await pool.end();

const sql = out.join("\n");
const target = path.join(import.meta.dirname, "..", "migrations", "047_seed_reference_data.sql");
fs.writeFileSync(target, sql);
console.log(`wrote ${path.relative(process.cwd(), target)} - ${total} rows across ${TABLES.length} tables`);
