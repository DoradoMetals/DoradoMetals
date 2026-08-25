// Proves one database is a faithful copy of another.
//
// Written for the step in PROMOTION.md where `test` is restored from a
// production dump. A restore that "looked fine" is not evidence: pg_restore
// reports errors it recovered from, skips objects the role could not create,
// and can exit 0 having quietly dropped a table's data. The only way to know is
// to compare the two afterwards.
//
// CONTENT, NOT COUNTS. Two tables can hold the same number of rows and
// different rows - a restore that lost a column's values, or a dump taken as a
// read-only role that could read the row but not every column. So each table is
// reduced to an md5 over its rows, ordered by their own text so the result does
// not depend on physical order. Counts are still reported, because when a hash
// differs the count is the first thing you want to know.
//
// SEQUENCES TOO. They are not tables and nothing else here looks at them, which
// matters more since migration 079: an order number comes from a sequence, and
// a restore that reproduced every row but reset a sequence would hand out
// numbers that are already taken.
//
// READ-ONLY ON BOTH SIDES. It opens both connections, runs SELECTs, and writes
// nothing anywhere. Safe to point at production, which is the expected source.
//
//   node scripts/compare-databases.mjs
//   node scripts/compare-databases.mjs --source PROD_READONLY_DATABASE_URL --target TEST_DATABASE_URL
//
// Exits non-zero if anything differs, or if it could not compare enough to be
// worth trusting.
import "#env";
import pg from "pg";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SOURCE_VAR = arg("--source", "PROD_READONLY_DATABASE_URL");
const TARGET_VAR = arg("--target", "TEST_DATABASE_URL");

const sourceUrl = process.env[SOURCE_VAR];
const targetUrl = process.env[TARGET_VAR];

if (!sourceUrl || !targetUrl) {
  console.error(
    `Need two connection strings.\n` +
      `  ${SOURCE_VAR} is ${sourceUrl ? "set" : "NOT SET"}\n` +
      `  ${TARGET_VAR} is ${targetUrl ? "set" : "NOT SET"}\n\n` +
      `Pass different env var names with --source and --target.`
  );
  process.exit(1);
}

const nameOf = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || "(none)";
  } catch {
    return "(unparseable)";
  }
};

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
};

// A COMPARISON OF SOMETHING WITH ITSELF PASSES PERFECTLY AND PROVES NOTHING.
// If both variables point at the same database every table matches, the script
// prints success, and the restore was never checked. Refuse.
if (nameOf(sourceUrl) === nameOf(targetUrl) && hostOf(sourceUrl) === hostOf(targetUrl)) {
  console.error(
    `${SOURCE_VAR} and ${TARGET_VAR} both point at ${nameOf(sourceUrl)} on ` +
      `${hostOf(sourceUrl)}.\nComparing a database with itself always passes. Refusing.`
  );
  process.exit(1);
}

const source = new pg.Pool({ connectionString: sourceUrl });
const target = new pg.Pool({ connectionString: targetUrl });

const SYSTEM = `nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'`;

async function tables(db) {
  const { rows } = await db.query(
    `SELECT n.nspname AS schema, c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND ${SYSTEM}
      ORDER BY 1, 2`
  );
  return rows.map((r) => `${r.schema}.${r.name}`);
}

async function sequences(db) {
  const { rows } = await db.query(
    `SELECT schemaname AS schema, sequencename AS name, last_value
       FROM pg_sequences ORDER BY 1, 2`
  );
  return rows;
}

async function fingerprint(db, qualified) {
  const [schema, name] = qualified.split(".");
  const { rows } = await db.query(
    `SELECT count(*)::int AS n,
            md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS sum
       FROM "${schema}"."${name}" t`
  );
  return rows[0];
}

const differences = [];
let compared = 0;

try {
  console.log(`source  ${SOURCE_VAR}  ->  ${nameOf(sourceUrl)} @ ${hostOf(sourceUrl)}`);
  console.log(`target  ${TARGET_VAR}  ->  ${nameOf(targetUrl)} @ ${hostOf(targetUrl)}\n`);

  const [sourceTables, targetTables] = await Promise.all([tables(source), tables(target)]);
  const all = [...new Set([...sourceTables, ...targetTables])].sort();

  const inSource = new Set(sourceTables);
  const inTarget = new Set(targetTables);

  for (const t of all) {
    if (!inTarget.has(t)) {
      differences.push(`${t} is in the source and MISSING from the target`);
      continue;
    }
    if (!inSource.has(t)) {
      differences.push(`${t} is in the target and not in the source`);
      continue;
    }

    // A table that cannot be read must fail rather than be skipped. A
    // permission error here usually means the dump was taken as a role that
    // could not read it either, which is exactly what this is looking for.
    let a, b;
    try {
      [a, b] = await Promise.all([fingerprint(source, t), fingerprint(target, t)]);
    } catch (err) {
      differences.push(`${t} could not be compared: ${err.message}`);
      continue;
    }

    compared += 1;
    if (a.n !== b.n) {
      const delta = b.n - a.n;
      differences.push(
        `${t}: ${a.n} rows in the source, ${b.n} in the target (${delta >= 0 ? "+" : ""}${delta})`
      );
    } else if (a.sum !== b.sum) {
      differences.push(`${t}: ${a.n} rows on both sides, contents differ`);
    }
  }

  const [sourceSeqs, targetSeqs] = await Promise.all([sequences(source), sequences(target)]);
  const seqKey = (s) => `${s.schema}.${s.name}`;
  const targetByKey = new Map(targetSeqs.map((s) => [seqKey(s), s]));

  for (const s of sourceSeqs) {
    const t = targetByKey.get(seqKey(s));
    if (!t) {
      differences.push(`sequence ${seqKey(s)} is MISSING from the target`);
    } else if (String(s.last_value) !== String(t.last_value)) {
      // A null on either side usually means the reading role lacks privileges
      // on the sequence rather than a real difference - say which it is, since
      // that is a confusing five minutes otherwise.
      const unreadable = s.last_value === null || t.last_value === null;
      differences.push(
        `sequence ${seqKey(s)}: source ${s.last_value}, target ${t.last_value}` +
          (unreadable ? "  (a null here is usually a permissions problem, not a difference)" : "")
      );
    }
  }

  // NON-VACUITY. A run that compared nothing - wrong database, empty target, a
  // role that can see no tables - would otherwise print success.
  if (compared === 0) {
    console.error("compared 0 tables. That is a failure, not a match.");
    process.exitCode = 1;
  } else if (differences.length === 0) {
    console.log(
      `identical: ${compared} tables and ${sourceSeqs.length} sequences match, ` +
        `row for row and byte for byte`
    );
  } else {
    console.error(`${differences.length} difference(s) across ${compared} tables compared:\n`);
    for (const d of differences) console.error(`  ${d}`);
    process.exitCode = 1;
  }
} finally {
  await source.end();
  await target.end();
}
