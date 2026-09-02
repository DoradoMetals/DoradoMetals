// Which feature writes which table, and does any table have more than one?
//
// THE QUESTION NO OTHER CHECK ASKS. Every review on this project is
// per-feature: you open features/purchase-orders, read its repos, and its
// writes look fine. What that cannot show you is that the table it is writing
// belongs to somebody else - because the other writer is in a directory you
// are not looking at.
//
// Found by hand, three times, before this existed:
//
//   D41  purchase-orders ran `UPDATE exchange.shipments SET net_charge` while
//        shipping/shipments owned that table and dual-wrote it. After the
//        purchase-orders pivot it would have been the ONE writer still writing
//        exchange alone, and the column would have drifted between the schemas
//        with nothing to report it - verify:parity does not cover shipments.
//   D42  sales-orders carried its own copies of three orders.orders statements.
//   and purchase-orders' own fifteen, which is what started the search.
//
// INLINE SQL COUNTS. D41 was a template literal inside repo.exchange.js, not a
// .sql file, so a scan of sql/ alone would have missed the one that mattered.
//
// Report-only by default; --strict exits non-zero on an undeclared finding, so
// it can go in CI once the migration settles. Not in `pnpm check` yet: the
// legacy repos are mid-deletion and their writes are expected duplicates.
//
//   pnpm --filter @dorado/api audit:table-owners [--strict] [--self-test]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const FEATURES = path.join(ROOT, "features");

// A table with more than one writing feature, where that is correct and why.
// Pinned from BOTH sides like audit:indexes: an entry that stops being true
// has to be removed, or the audit starts lying in the quiet direction.
const ACCEPTED = [
  // MID-PIVOT DUPLICATION. A feature being restructured holds its old repo
  // files (repo.exchange.js, repo.next.ts, repo.dual.js) beside the new
  // per-table repos, so both appear as writers. These entries go when the
  // pivot deletes those files - which is exactly why they are pinned here: a
  // table that stays on this list after its feature is done is a real finding.
  { table: "orders.items", features: ["orders", "orders/items"],
    why: "orders/items owns it; features/orders/repo.mirror.ts re-derives the whole line set from exchange on every dual write, and that mirror goes at promotion" },
  { table: "orders.addresses", features: ["orders"],
    why: "written together with the order at creation; one feature since wave 5A dissolved the two direction-named ones" },
  { table: "orders.orders", features: ["orders"],
    why: "canonical statements are in features/orders (D42); the mirror copies live there too since wave 5A" },
  { table: "orders.spots", features: ["orders", "orders/spots"],
    why: "orders/spots owns it; repo.mirror.ts and sql/create_spot.sql are the creation path and the dual-write mirror, both going at promotion" },
    { table: "orders.transactions", features: ["orders", "orders/transactions"],
    why: "orders/transactions owns setAmount; the rest is order creation, one payload" },
  { table: "places.addresses", features: ["orders", "places/addresses"],
    why: "places/addresses owns it; orders snapshots an address at creation" },
  { table: "refiners.spots", features: ["orders", "refiners/spots"],
    why: "refiners/spots owns the refiner quote; features/orders/repo.mirror.ts goes with the pivot" },
  { table: "refiners.items", features: ["orders", "refiners/items"],
    why: "refiners/items owns the refiner premium; features/orders/repo.mirror.ts goes with the pivot" },
  { table: "checkout.checkouts", features: ["checkout", "orders"],
    why: "the checkout feature owns the row and its items now (D208); orders/create.ts consumes them" },
  { table: "checkout.items", features: ["checkout", "orders"],
    why: "the checkout feature owns the row and its items now (D208); orders/create.ts consumes them" },

  // VERIFIED SAFE, for a reason that is not "it goes away".
  //
  // payments sets "stripeCustomerId" on the user row, which is a payments fact
  // stored on a users table. Checked rather than assumed: migration 056
  // installs mirror_users_to_auth, an AFTER INSERT OR UPDATE trigger on
  // exchange.users that copies the row into auth.users INCLUDING
  // "stripeCustomerId". Both halves therefore write the same value and the
  // trigger reconciles from below, which is what makes the second writer
  // harmless here and not a split.
  { table: "exchange.users", features: ["payments", "users"],
    why: "payments sets stripeCustomerId; 056's mirror_users_to_auth trigger reconciles into auth.users" },
  { table: "auth.users", features: ["payments", "users"],
    why: "same write, new-schema half; 056's trigger keeps it equal to exchange.users" },

  { table: "payments.details", features: ["payments", "payments/details"],
    why: "payments/details owns the payout account rows; the parent's updateMethod upserts the STRIPE instrument row (provider_ref-keyed), a different population of the same table" },
  { table: "refiners.orders", features: ["orders", "refiners/orders"],
    why: "refiners/orders owns the engagement; orders' set_refinery.sql upserts refiner_id on it because attaching a refiner is the order pipeline's own act (093)" },
];

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    // .sql AND source: D41 was a template literal, not a file.
    else if (/\.(sql|ts|js)$/.test(e.name) && !e.name.includes(".test.")) out.push(full);
  }
  return out;
};

// The feature a file belongs to: the path under features/ with any sql/ segment
// and the filename removed. features/shipping/shipments/sql/x.sql -> shipping/shipments
const featureOf = (file) => {
  const rel = path.relative(FEATURES, file);
  const parts = rel.split(path.sep).slice(0, -1).filter((p) => p !== "sql" && p !== "legacy");
  return parts.join("/") || "(root)";
};

// Comment-stripped, because a statement quoted in a comment is not a write -
// several files describe the statement they mirror.
const strip = (src) =>
  src.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const WRITE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?([a-z_]+)\.([a-z_]+)/gi;

const files = [...walk(FEATURES)];
const writers = new Map();   // "schema.table" -> Map(feature -> Set(file))
let statements = 0;

for (const file of files) {
  const feature = featureOf(file);
  for (const m of strip(fs.readFileSync(file, "utf8")).matchAll(WRITE)) {
    const table = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
    statements++;
    if (!writers.has(table)) writers.set(table, new Map());
    const byFeature = writers.get(table);
    if (!byFeature.has(feature)) byFeature.set(feature, new Set());
    byFeature.get(feature).add(path.relative(ROOT, file));
  }
}

if (process.argv.includes("--self-test")) {
  // The detector must find a table written from two features. Proving it fires
  // is the point: audit:wire-readiness once walked zero files and called every
  // switch ready.
  const shared = [...writers].filter(([, f]) => f.size > 1);
  console.log(
    shared.length
      ? `self-test PASSED: the detector reports ${shared.length} multi-writer table(s)`
      : "self-test FAILED: no table has two writing features, so this cannot detect one"
  );
  process.exit(shared.length ? 0 : 1);
}

const accepted = new Map(ACCEPTED.map((a) => [a.table, a]));
const shared = [...writers]
  .filter(([, byFeature]) => byFeature.size > 1)
  .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

console.log(
  `${statements} write statement(s) across ${files.length} file(s), ` +
    `${writers.size} table(s) written, ${shared.length} with more than one writing feature\n`
);

let undeclared = 0;
for (const [table, byFeature] of shared) {
  const note = accepted.get(table);
  const features = [...byFeature.keys()].sort();
  if (note && features.every((f) => note.features.includes(f))) {
    console.log(`  ok   ${table}  ${features.join(", ")}  - ${note.why}`);
    continue;
  }
  undeclared++;
  console.log(`  MANY ${table}`);
  for (const f of features) {
    console.log(`         ${f}: ${[...byFeature.get(f)].sort().join(", ")}`);
  }
}

// An accepted entry that no longer describes a real finding is a lie the other
// way round, so it has to go.
for (const a of ACCEPTED) {
  if (!writers.has(a.table)) {
    undeclared++;
    console.log(`  STALE ${a.table} is declared in ACCEPTED but nothing writes it`);
  }
}

if (!shared.length) console.log("  every table has exactly one writing feature");
console.log(
  `\n${undeclared} undeclared finding(s).` +
    (undeclared ? " A table with two writers means one of them will not dual-write." : "")
);
process.exitCode = process.argv.includes("--strict") && undeclared ? 1 : 0;
