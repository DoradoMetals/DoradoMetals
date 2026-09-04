import "#env";
import fs from "node:fs";
import path from "node:path";
import pool from "#pool";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const legacy = args[args.indexOf("--legacy") + 1];
const outDir = args[args.indexOf("--dir") + 1];

if (!target || !target.includes(".") || !outDir || args.indexOf("--dir") === -1) {
  console.error(
    "usage: generate-feature.mjs <schema>.<table> --dir <db/name> [--legacy <schema>.<table>]"
  );
  process.exit(1);
}

const ROOT = path.join(import.meta.dirname, "..");
const dir = path.isAbsolute(outDir) ? outDir : path.join(ROOT, outDir);

const columnsOf = async (qualified) => {
  const [schema, table] = qualified.split(".");
  const { rows } = await pool.query(
    `SELECT column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable,
            column_default IS NOT NULL AS has_default
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [schema, table]
  );
  if (!rows.length) throw new Error(`${qualified} has no columns - does it exist?`);
  return rows;
};

const cols = await columnsOf(target);
const legacyCols = legacy ? await columnsOf(legacy) : null;

const names = cols.map((c) => c.name);
const legacyNames = legacyCols ? legacyCols.map((c) => c.name) : null;

const projected = legacyNames ? names.filter((n) => legacyNames.includes(n)) : names;
const onlyNew = legacyNames ? names.filter((n) => !legacyNames.includes(n)) : [];
const onlyOld = legacyNames ? legacyNames.filter((n) => !names.includes(n)) : [];

if (!projected.includes("id")) {
  console.error(`${target} has no id column - this generator assumes a uuid primary key called id`);
  process.exit(1);
}

const MANAGED = new Set(["id", "created_at", "updated_at"]);
const writable = projected.filter((n) => !MANAGED.has(n));
const hasUpdatedAt = names.includes("updated_at");
const hasCreatedAt = names.includes("created_at");

const q = (name) => (/[A-Z]/.test(name) ? `"${name}"` : name);

const list = (ns, indent = "       ") => {
  const out = [];
  let line = "";
  for (const n of ns) {
    const qn = q(n);
    if ((line + qn).length > 62) { out.push(line.replace(/, $/, "")); line = ""; }
    line += `${qn}, `;
  }
  if (line) out.push(line.replace(/, $/, ""));
  return out.join(`,\n${indent}`);
};

const RETURNING = list(projected, "          ");
const SELECTED  = list(projected, "       ");
const placeholders = (n, from = 1) => Array.from({ length: n }, (_, i) => `$${i + from}`).join(", ");

const files = {};

files["sql/get_one.sql"] = `-- One row, by id.
--
-- Columns are listed rather than selected with *${onlyNew.length ? `: ${target} carries
-- ${onlyNew.join(", ")}, which ${legacy} has no equivalent for, and
-- ${onlyNew.length === 1 ? "it" : "they"} must not reach the wire while both schemas are serving` : "."}
SELECT ${SELECTED}
  FROM ${target}
 WHERE id = $1
`;

files["sql/get_all.sql"] = `-- Every row${hasCreatedAt ? ", newest first" : ""}.
${hasCreatedAt ? `--
-- created_at is not unique, so id breaks the tie. Without a unique ORDER BY the
-- rows come back in physical order, which changes as rows are updated.
` : ""}SELECT ${SELECTED}
  FROM ${target}
${hasCreatedAt ? " ORDER BY created_at DESC, id DESC\n" : " ORDER BY id ASC\n"}`;

files["sql/create.sql"] = `-- A new row. The id is supplied by the service, not generated here, so that
-- both schemas end up with the same primary key.
INSERT INTO ${target}
       (${list(["id", ...writable], "        ")})
VALUES (${placeholders(writable.length + 1)})
RETURNING ${RETURNING}
`;

const updatable = writable;
files["sql/update.sql"] = `-- Every caller-supplied field.
${hasUpdatedAt ? `--
-- updated_at is maintained here. Forty-two of the fifty-two UPDATE statements
-- against exchange do not maintain theirs, which is why a drifted row cannot be
-- spotted from its timestamp.
` : ""}UPDATE ${target}
   SET ${updatable.map((n, i) => `${q(n)} = $${i + 1}`).join(",\n       ")}${hasUpdatedAt ? ",\n       updated_at = NOW()" : ""}
 WHERE id = $${updatable.length + 1}
RETURNING ${RETURNING}
`;

files["sql/delete.sql"] = `-- Remove a row.
DELETE FROM ${target} WHERE id = $1
`;

if (legacy) {
  files["sql/legacy/create.sql"] = `-- The same row, written to the schema still serving as the record of truth.
-- The id is supplied so both schemas agree on it.
INSERT INTO ${legacy}
       (${list(["id", ...writable], "        ")})
VALUES (${placeholders(writable.length + 1)})
RETURNING id
`;
  files["sql/legacy/update.sql"] = `-- Mirror of sql/update.sql against the schema still serving as record of truth.
UPDATE ${legacy}
   SET ${updatable.map((n, i) => `${q(n)} = $${i + 1}`).join(",\n       ")}${legacyNames.includes("updated_at") ? ",\n       updated_at = NOW()" : ""}
 WHERE id = $${updatable.length + 1}
RETURNING id
`;
  files["sql/legacy/delete.sql"] = `-- Mirror of sql/delete.sql.
DELETE FROM ${legacy} WHERE id = $1
`;
}

const client = await pool.connect();
let prepared = 0;
try {
  await client.query("BEGIN");
  let n = 0;
  for (const [name, text] of Object.entries(files)) {
    const stmt = text.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
    try {
      await client.query(`PREPARE gen_check_${n++} AS ${stmt}`);
      prepared += 1;
    } catch (err) {
      console.error(`\nGENERATED SQL DOES NOT PARSE - nothing written.\n\n  ${name}\n  ${err.message}\n`);
      console.error(stmt);
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
      process.exit(1);
    }
  }
  await client.query("ROLLBACK");
} finally {
  client.release();
}

const targets = Object.keys(files).map((f) => path.join(dir, f));
const existing = targets.filter((f) => fs.existsSync(f));
if (existing.length) {
  console.error("refusing to overwrite:\n" + existing.map((f) => `  ${path.relative(ROOT, f)}`).join("\n"));
  await pool.end();
  process.exit(1);
}

for (const [name, text] of Object.entries(files)) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

console.log(`${target} -> ${outDir}`);
console.log(`  ${Object.keys(files).length} file(s) written, all ${prepared} statement(s) PREPAREd against the database first`);
console.log(`  projection: ${projected.length} column(s)`);
if (onlyNew.length) console.log(`  NOT projected - ${target} only: ${onlyNew.join(", ")}`);
if (onlyOld.length) {
  console.log(`  NOT WRITTEN - ${legacy} only: ${onlyOld.join(", ")}`);
  console.log(`     a rename the generator will not guess. If one of these IS a rename of a`);
  console.log(`     column above, map it by hand in sql/legacy/*.sql before using this.`);
}
console.log(`  repo.ts, service.ts, controller.ts, routes.ts, wire.ts and tests/ are NOT`);
console.log(`  generated - they are short, and what they contain is a decision.`);

await pool.end();
