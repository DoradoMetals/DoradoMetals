// Emits the reference data that has no source in exchange, as a migration.
//
// Most of the new schema is a reshaping of exchange, and the backfills derive
// it. These tables are not: they are new facts about the business that were
// written directly into dev in January and exist nowhere else. The DORADO
// organization, the shop locations and their opening hours, the fulfillment and
// payment methods on offer, and who is an employee.
//
// There is nothing to derive them from, so they are emitted as literal values
// and carried across as-is, ids included. Keeping the ids matters: locations
// point at an organization, hours point at a location, and the whole set only
// hangs together if those references survive.
//
// Regenerate with `pnpm --filter @dorado/api dump:seed` if dev's copy changes.
// Read-only against the database.
import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

// Emitted in dependency order.
const TABLES = [
  ["organizations", "organizations", "type = 'DORADO'"],
  // The addresses the shops are at. Not in exchange - a location's address was
  // never a customer address - and not snapshots either, so nothing derives
  // them and places.locations cannot be inserted without them.
  ["places", "addresses", "id IN (SELECT address_id FROM places.locations WHERE address_id IS NOT NULL)"],
  ["places", "locations", null],
  ["places", "location_hours", null],
  // The carrier service catalogue and the box sizes. Both reference
  // shipping.carriers, which keeps its exchange ids, and those ids are the same
  // in dev and production - so these can be written as literals like the rest of
  // the reference data.
  //
  // exchange.carrier_services does hold the same eight (carrier, name) pairs on
  // production, so these could in principle be derived from it. They are not,
  // for two reasons: no id is shared, so deriving would re-key them and orphan
  // anything already pointing at a service; and dev's copy of
  // carrier_services holds only two of the eight, so a derivation would produce
  // different results depending on which database it ran against. Seeding from
  // dev gives every database exactly what the application expects.
  ["shipping", "services", null],
  ["shipping", "packages", null],
  ["fulfillments", "methods", null],
  ["payments", "methods", null],
  ["auth", "employees", null],
];

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

// Columns that point at a row the *backfill* creates rather than the seed.
//
// Those rows get fresh ids - an organization is a new object, not the supplier
// it came from - so their ids in dev mean nothing on another database. Writing
// them as literals produced a foreign key violation the moment the seed ran
// against a database built from exchange rather than copied from dev, which is
// exactly what the from-empty check is for.
//
// So the reference is emitted as a lookup on the natural key instead. The
// organizations a shop can belong to are identified by (type, name), which is
// what the backfill itself conflicts on.
const RESOLVE = {
  "places.locations.organization_id": async (id) => {
    const [org] = await q(
      "SELECT type, name FROM organizations.organizations WHERE id = $1",
      [id]
    );
    if (!org) return null;
    return `(SELECT id FROM organizations.organizations WHERE type = '${org.type.replace(/'/g, "''")}' AND name = '${org.name.replace(/'/g, "''")}')`;
  },
};
const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s}"`);

// Renders a JS value back to SQL. Everything goes through a cast so an empty
// table or an all-null column still types correctly.
function literal(v, type) {
  if (v === null || v === undefined) return `NULL::${type}`;
  // Everything arrives as text from Postgres, so it only has to be quoted and
  // cast back. Arrays included: text[]::text renders {a,b}, which is what the
  // cast back expects.
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'::${type}`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  // A Postgres array is not JSON. payments.methods.fit_bullets is text[], and
  // emitting it as ["a","b"] produces a malformed array literal rather than an
  // error anyone could read. Items are quoted and backslash-escaped for the
  // array, then the whole literal is escaped once for the SQL string.
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
-- something that has no source. Ids are preserved: locations reference an
-- organization and hours reference a location, and the set only hangs together
-- if those survive.
--
-- Every insert is ON CONFLICT DO NOTHING. On dev this is a no-op; on an empty
-- database it is the difference between a schema that exists and a schema that
-- works, since without payment and fulfillment methods there is nothing for a
-- customer to choose at checkout.
--
-- GENERATED by scripts/dump-seed.mjs. Regenerate rather than editing by hand.
--
-- exchange is untouched - it is not read here either, because there is nothing
-- in it to read.
`);

let total = 0;

for (const [schema, table, where] of TABLES) {
  // Keyed on the table's own regclass. Joining pg_attribute by column name
  // instead matched the indexes as well - they share their columns' names -
  // and every indexed column came out duplicated.
  const cols = await q(
    `SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
     FROM pg_attribute a
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [`${schema}.${table}`]
  );

  // Every column is read as text, and re-cast on the way back in.
  //
  // Reading them as values loses precision: node-postgres parses a timestamptz
  // into a JS Date, which holds milliseconds, and dev's timestamps carry
  // microseconds. Emitting those produced a seed that was almost right - the
  // from-empty check caught .849 where dev has .849098 - and it is the same
  // truncation migration 015 had to undo. Postgres renders its own values
  // exactly; there is no reason to make JS an intermediary.
  const rows = await q(
    `SELECT ${cols.map((c) => `${ident(c.column_name)}::text AS ${ident(c.column_name)}`).join(", ")}
     FROM ${ident(schema)}.${ident(table)} ${where ? `WHERE ${where}` : ""}
     ORDER BY id`
  );
  if (!rows.length) continue;
  total += rows.length;

  say(`-- ${schema}.${table} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
  if (where) say(`-- Only ${where.replace(/'/g, "")}; the rest are derived from exchange by 029.`);
  say(`INSERT INTO ${ident(schema)}.${ident(table)} (${cols.map((c) => ident(c.column_name)).join(", ")})`);
  say("VALUES");
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
  say("ON CONFLICT (id) DO NOTHING;");
  say();
}

await pool.end();

const sql = out.join("\n");
const target = path.join(import.meta.dirname, "..", "migrations", "047_seed_reference_data.sql");
fs.writeFileSync(target, sql);
console.log(`wrote ${path.relative(process.cwd(), target)} - ${total} rows across ${TABLES.length} tables`);
