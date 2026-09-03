// Generates ONE FILE PER DATABASE ENTITY, from information_schema.
//
// Replaces generate-tables.mjs, which wrote one file per SCHEMA holding every
// table's row schema. The database shape is one file per table, so the
// contracts are too: src/<schema>/<table>.ts, and a consumer writes
// `orders.items.Row` rather than reaching into a 596-line barrel.
//
// Each entity file has a GENERATED REGION delimited by the two markers below.
// The generator owns that region and NOTHING ELSE: everything under it is
// hand-written derivations (New, Patch, named reads), each a .pick()/.omit()/
// .extend() of a Row. So regenerating after a column is added rewrites the
// region in place and leaves the derivations alone.
//
// The generator CREATES a missing entity file (region plus an empty hand
// section) and REWRITES the region of an existing one. It never deletes a
// file: a table dropped from the database leaves its contract behind, and
// verify:fresh reports it rather than this quietly removing derivations.
//
// Enums are emitted ONCE, into their OWNING schema's enums.ts, and imported by
// every table that uses one - across schemas where necessary. Two schemas hold
// different types with the same name (orders.direction is purchase/sale,
// shipping.direction is Inbound/Outbound/Return), so they are keyed by schema
// AND name and never collapsed.
//
// Fully generated, no hand section, compared byte-for-byte by verify:fresh:
//   src/<schema>/enums.ts     the schema's enum types
//   src/<schema>/index.ts     the table namespaces of one schema
//   src/schemas.ts            the schema namespaces; src/index.ts re-exports it
//
//   pnpm --filter @dorado/contracts generate
//   CONTRACT_SCHEMAS=exchange,orders pnpm --filter @dorado/contracts generate
//
// READS api/.env, NOT ITS OWN COPY. `import "dotenv/config"` loads .env
// relative to the CURRENT WORKING DIRECTORY, and this package had its own -
// carrying a second copy of the database password and a connection string
// naming a database that no longer exists. api/env.ts resolves from its own
// file location for exactly this reason.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "api", ".env"),
});

// Every schema the API reads. exchange is frozen but still read by scripts and
// by the payouts feature, so it gets entities like everything else.
const DEFAULT_SCHEMAS = [
  "exchange",
  "leads", "reviews", "rates", "spots", "products",
  "media", "organizations", "metals",
  "orders", "shipping", "tax", "payments", "fulfillments", "places",
  "auth", "checkout", "refiners",
].join(",");

const SCHEMAS = (process.env.CONTRACT_SCHEMAS ?? DEFAULT_SCHEMAS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Overridable so verify:fresh can generate somewhere else and compare, rather
// than overwriting the committed files to find out whether they differ.
const OUTDIR = process.env.CONTRACT_OUTDIR ?? path.join(import.meta.dirname, "..", "src");

export const START = "// generated:start";
export const END = "// generated:end";

// Contracts describe what crosses the wire, not what the driver hands back.
// Timestamps are therefore strings: they are ISO-8601 by the time they have
// been through JSON.stringify, whatever pg returned in process.
const TYPE_MAP = {
  uuid: "z.string().uuid()",
  text: "z.string()",
  character: "z.string()",
  "character varying": "z.string()",
  boolean: "z.boolean()",
  numeric: "z.number()",
  integer: "z.number().int()",
  bigint: "z.number().int()",
  smallint: "z.number().int()",
  "double precision": "z.number()",
  real: "z.number()",
  date: "z.string()",
  "time without time zone": "z.string()",
  "time with time zone": "z.string()",
  "timestamp with time zone": "z.string()",
  "timestamp without time zone": "z.string()",
  jsonb: "z.unknown()",
  json: "z.unknown()",
  bytea: "z.string()", // encoded to base64 in the queries that select it
};

// `public` is a reserved word in strict mode, and every module is strict, so
// `export * as public` does not parse. A schema whose name is reserved is
// exported under a `_schema` suffix; only `public` hits it, and only because
// exchange.sales_tax_rules is typed by two enums that live there.
const RESERVED = new Set([
  "public", "private", "protected", "static", "package", "implements",
  "interface", "let", "yield", "await", "enum", "default",
]);
const exportName = (schema) => (RESERVED.has(schema) ? `${schema}_schema` : schema);

const pascal = (s) =>
  s.split(/[_\s]+/).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const target = new URL(process.env.DATABASE_URL);
console.log(`reading from ${target.pathname.slice(1)} @ ${target.hostname}`);

const { rows: enumRows } = await client.query(`
  SELECT n.nspname AS schema, t.typname AS name, e.enumlabel AS label
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  ORDER BY n.nspname, t.typname, e.enumsortorder
`);
const enums = {};
for (const r of enumRows) (enums[`${r.schema}.${r.name}`] ??= new Set()).add(r.label);

// Read every schema's tables and columns first, so enum ownership is known
// before a single file is written.
const model = [];
for (const schema of SCHEMAS) {
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema]
  );
  if (!tables.length) {
    console.log(`  ${schema}: no tables, skipped`);
    continue;
  }
  const { rows: columns } = await client.query(
    `SELECT table_name, column_name, data_type, udt_schema, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [schema]
  );
  const byTable = {};
  for (const c of columns) (byTable[c.table_name] ??= []).push(c);
  model.push({ schema, tables: tables.map((t) => t.table_name), byTable });
}

await client.end();

// Which enums are actually used, and by which schema they are owned.
const usedEnums = new Map(); // ownerSchema -> Map(enumName -> values[])
for (const { byTable } of model) {
  for (const cols of Object.values(byTable)) {
    for (const c of cols) {
      const qualified = `${c.udt_schema}.${c.udt_name}`;
      if (c.data_type !== "USER-DEFINED" || !enums[qualified]) continue;
      const owner = usedEnums.get(c.udt_schema) ?? new Map();
      owner.set(c.udt_name, [...enums[qualified]]);
      usedEnums.set(c.udt_schema, owner);
    }
  }
}

const HEAD = (subject) =>
  `// GENERATED by packages/contracts/scripts/generate-entities.mjs\n` +
  `// Run \`pnpm --filter @dorado/contracts generate\` to refresh.\n` +
  `//\n// ${subject}\n`;

const unmapped = new Set();
const written = [];
const wholeFiles = [];

const writeFile = (rel, body) => {
  const full = path.join(OUTDIR, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
};

// ---------------------------------------------------------------- enums.ts
for (const [owner, byName] of usedEnums) {
  const lines = [...byName.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, values]) => {
    const n = pascal(name);
    return `export const ${n} = z.enum([${values.map((v) => JSON.stringify(v)).join(", ")}]);\n` +
      `export type ${n} = z.infer<typeof ${n}>;`;
  });
  writeFile(
    `${owner}/enums.ts`,
    `${HEAD(`Postgres enum types owned by the \`${owner}\` schema.`)}import { z } from "zod/v4";\n\n${lines.join("\n\n")}\n`
  );
  wholeFiles.push(`${owner}/enums.ts`);
}

// ------------------------------------------------------------- entity files
for (const { schema, tables, byTable } of model) {
  for (const table of tables) {
    const cols = byTable[table] ?? [];
    const needed = new Map(); // ownerSchema -> Set(PascalName)
    const lines = cols.map((c) => {
      let zod;
      const qualified = `${c.udt_schema}.${c.udt_name}`;
      if (c.data_type === "USER-DEFINED" && enums[qualified]) {
        zod = pascal(c.udt_name);
        const set = needed.get(c.udt_schema) ?? new Set();
        set.add(zod);
        needed.set(c.udt_schema, set);
      } else if (c.data_type === "ARRAY") {
        zod = `z.array(${TYPE_MAP[c.udt_name.replace(/^_/, "")] ?? "z.unknown()"})`;
      } else {
        zod = TYPE_MAP[c.data_type];
        if (!zod) {
          unmapped.add(`${c.data_type} (${schema}.${table}.${c.column_name})`);
          zod = "z.unknown()";
        }
      }
      if (c.is_nullable === "YES") zod += ".nullable()";
      return `  ${JSON.stringify(c.column_name)}: ${zod},`;
    });

    const imports = [`import { z } from "zod/v4";`];
    for (const [owner, names] of [...needed.entries()].sort()) {
      const from = owner === schema ? "./enums.js" : `../${owner}/enums.js`;
      imports.push(`import { ${[...names].sort().join(", ")} } from "${from}";`);
    }

    const region =
      `${START}\n` +
      `${HEAD(`Postgres table: ${schema}.${table}`)}${imports.join("\n")}\n\n` +
      `export const Row = z.object({\n${lines.join("\n")}\n});\nexport type Row = z.infer<typeof Row>;\n` +
      `${END}`;

    const rel = `${schema}/${table}.ts`;
    const full = path.join(OUTDIR, rel);
    if (fs.existsSync(full)) {
      const current = fs.readFileSync(full, "utf8");
      const a = current.indexOf(START);
      const b = current.indexOf(END);
      if (a === -1 || b === -1 || b < a) {
        console.error(`  ${rel}: no generated region - refusing to overwrite hand-written contract`);
        process.exitCode = 1;
        continue;
      }
      writeFile(rel, current.slice(0, a) + region + current.slice(b + END.length));
    } else {
      writeFile(rel, `${region}\n\n// Hand-written derivations go here: New, Patch, named reads.\n`);
    }
    written.push(rel);
  }

  // ------------------------------------------------------------- schema index
  const members = tables.map((t) => `export * as ${t} from "./${t}.js";`);
  if (usedEnums.has(schema)) members.unshift(`export * as enums from "./enums.js";`);
  writeFile(
    `${schema}/index.ts`,
    `${HEAD(`Every entity of the \`${schema}\` schema, one namespace each.`)}${members.join("\n")}\n`
  );
  wholeFiles.push(`${schema}/index.ts`);
}

// An enum-owning schema with no tables of its own still needs its barrel.
for (const owner of usedEnums.keys()) {
  if (model.some((m) => m.schema === owner)) continue;
  writeFile(
    `${owner}/index.ts`,
    `${HEAD(`Enum types of the \`${owner}\` schema.`)}export * as enums from "./enums.js";\n`
  );
  wholeFiles.push(`${owner}/index.ts`);
}

// --------------------------------------------------------------- schemas.ts
const schemaNames = [...new Set([...model.map((m) => m.schema), ...usedEnums.keys()])].sort();
writeFile(
  "schemas.ts",
  `${HEAD("Every database schema, one namespace each. src/index.ts re-exports this\n// beside the computed shapes no table backs.")}` +
    schemaNames.map((s) => `export * as ${exportName(s)} from "./${s}/index.js";`).join("\n") +
    "\n"
);
wholeFiles.push("schemas.ts");

console.log(`wrote ${written.length} entity file(s) across ${schemaNames.length} schema(s), ${wholeFiles.length} generated barrel/enum file(s)`);
if (unmapped.size) {
  console.log("unmapped types (fell back to z.unknown()):");
  for (const u of unmapped) console.log("  " + u);
}
