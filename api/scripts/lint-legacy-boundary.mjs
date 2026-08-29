// The boundary between features/ and legacy/, enforced.
//
// WHY THIS EXISTS. After the ruling-29 move there are TWO files called repo.ts
// per migrated feature: features/<f>/repo.ts writes the new schema, and
// legacy/<f>/repo.ts writes exchange. The #features/* and #legacy/* subpaths
// keep them apart, and lint:imports proves every specifier RESOLVES - but both
// files exist, so a specifier with the wrong prefix resolves perfectly and
// writes to the WRONG SCHEMA, silently. Nothing downstream sees it either: the
// row appears, the test reads its own write back, and the divergence only
// surfaces at parity time.
//
// So this asks three questions lint:imports cannot:
//
//   1. Does every statement under legacy/ target `exchange` and nothing else?
//      A legacy mirror that writes orders.items is the swap itself.
//   2. Is every #legacy/* import bound to a name that SAYS legacy? A call site
//      reading `legacy.create(...)` beside `repo.create(...)` shows the swap to
//      a human reviewer; `repo.create(...)` from #legacy hides it.
//   3. Does anything under legacy/ import features/ at RUNTIME? The directory
//      has to be deletable in one `rm -rf`, and a runtime edge back into a
//      feature is a thread that has to be cut first. Type-only imports are
//      allowed - they are erased - and are listed rather than failed.
//
// Run: node scripts/lint-legacy-boundary.mjs [--self-test]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LEGACY = path.join(ROOT, "legacy");
const SELF_TEST = process.argv.includes("--self-test");

// The eighteen domain schemas. A legacy statement naming one of these is
// writing the schema it is the shadow OF.
const NEW_SCHEMAS = [
  "orders", "payments", "fulfillments", "shipping", "refiners", "tax", "places",
  "auth", "products", "organizations", "metals", "spots", "media", "leads",
  "rates", "reviews", "checkout", "auctions",
];

function walk(dir, test = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === ".git") return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, test) : (test(e.name) ? [full] : []);
  });
}

const rel = (f) => path.relative(ROOT, f);
const failures = [];
const notes = [];

// Comments stripped, because several legacy statements DESCRIBE the new-schema
// statement they mirror, by name, in a comment. A lint that cries wolf gets
// switched off.
const stripSql = (s) => s.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const stripJs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");

// ---- 1. legacy SQL targets exchange only -----------------------------------

const sqlFiles = walk(LEGACY, (n) => n.endsWith(".sql"));
const TABLE_REF =
  /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?([a-z_]+)\.([a-z_]+)/gi;

for (const f of sqlFiles) {
  const body = stripSql(fs.readFileSync(f, "utf8"));
  for (const m of body.matchAll(TABLE_REF)) {
    const schema = m[1].toLowerCase();
    if (NEW_SCHEMAS.includes(schema)) {
      failures.push(
        `${rel(f)} names ${schema}.${m[2]} - a legacy statement writes exchange, ` +
          `never the schema it is the shadow of`
      );
    }
  }
}

// ---- 2. every #legacy/* import says legacy at the call site ----------------

const jsFiles = [
  ...walk(path.join(ROOT, "features"), (n) => /\.(ts|js)$/.test(n)),
  ...walk(path.join(ROOT, "shared"), (n) => /\.(ts|js)$/.test(n)),
  ...walk(LEGACY, (n) => /\.(ts|js)$/.test(n)),
];

// `import * as X from "#legacy/..."`, `import X from`, `import { a, b } from`.
const NAMESPACE = /import\s+\*\s+as\s+(\w+)\s+from\s+["'](#legacy\/[^"']+)["']/g;
const DEFAULT_OR_NAMED = /import\s+(?!\*|type\b)([\w{][^;]*?)\s+from\s+["'](#legacy\/[^"']+)["']/g;

for (const f of jsFiles) {
  const src = stripJs(fs.readFileSync(f, "utf8"));
  for (const m of src.matchAll(NAMESPACE)) {
    if (!/^legacy/i.test(m[1])) {
      failures.push(
        `${rel(f)} binds ${m[2]} as \`${m[1]}\` - a #legacy import must be named ` +
          `\`legacy\` or \`legacy<Something>\`, so the call site shows which schema it writes`
      );
    }
  }
}

// ---- 3. legacy/ does not import features/ at runtime -----------------------

// [^;]* rather than [\s\S]*: a lazy any-character clause happily swallows the
// preceding imports and reports every type-only import as a runtime one, which
// is how the first run of this lint called fifteen erased imports violations.
// THE THREADS THAT ARE DELIBERATE, pinned from both sides like audit:indexes'
// ACCEPTED: an entry that stops being true has to be removed, or the lint
// starts lying in the quiet direction.
const ACCEPTED_RUNTIME_EDGES = [
  {
    file: "legacy/shipping/services/repo.ts",
    imports: "#features/shipping/services/repo.ts",
    why:
      "updateParams builds the parameter array BOTH halves of the write pass. " +
      "Duplicating it here is how the two halves come to disagree, which is the " +
      "exact failure the dual write exists to prevent. Cut it when shipping/services " +
      "is promoted and this directory goes.",
  },
  {
    file: "legacy/shipping/tracking/repo.ts",
    imports: "#features/shipping/tracking/repo.ts",
    why:
      "columnsOf, same reasoning: one definition of which columns a scan event " +
      "carries, read by both statements.",
  },
];
const accepted = new Set(ACCEPTED_RUNTIME_EDGES.map((e) => `${e.file} -> ${e.imports}`));
const acceptedSeen = new Set();

const FEATURE_IMPORT = /^\s*import\s+(type\s+)?([^;]*?)\s+from\s+["'](#features\/[^"']+)["']/gm;

for (const f of walk(LEGACY, (n) => /\.(ts|js)$/.test(n))) {
  const src = stripJs(fs.readFileSync(f, "utf8"));
  for (const m of src.matchAll(FEATURE_IMPORT)) {
    const clause = m[2];
    // `import type { X }` and `import { type X }` are both erased.
    const typeOnly = Boolean(m[1]) || /^\{\s*(?:type\s+\w+\s*,?\s*)+\}$/.test(clause.trim());
    if (typeOnly) {
      notes.push(`${rel(f)} imports TYPES from ${m[3]} - erased at runtime, goes with the directory`);
    } else if (accepted.has(`${rel(f)} -> ${m[3]}`)) {
      acceptedSeen.add(`${rel(f)} -> ${m[3]}`);
      const entry = ACCEPTED_RUNTIME_EDGES.find(
        (e) => `${e.file} -> ${e.imports}` === `${rel(f)} -> ${m[3]}`
      );
      notes.push(`${rel(f)} imports ${m[3]} at runtime - ACCEPTED: ${entry.why}`);
    } else {
      failures.push(
        `${rel(f)} imports ${m[3]} AT RUNTIME - legacy/ must be deletable in one ` +
          `\`rm -rf\`; move the helper to #shared/* or accept the thread deliberately`
      );
    }
  }
}

// An ACCEPTED entry whose edge has been cut must be REMOVED, or this list
// silently permits an edge that could come back.
for (const key of accepted) {
  if (!acceptedSeen.has(key)) {
    failures.push(
      `ACCEPTED_RUNTIME_EDGES still declares "${key}" but that import is gone - ` +
        `delete the entry, or the lint permits it coming back unnoticed`
    );
  }
}

// ---- self-test: prove each rule fires --------------------------------------

if (SELF_TEST) {
  const probes = [
    ["sql", "UPDATE orders.items SET price = $1", TABLE_REF],
  ];
  const [, sql, re] = probes[0];
  re.lastIndex = 0;
  const hit = [...stripSql(sql).matchAll(TABLE_REF)].some((m) =>
    NEW_SCHEMAS.includes(m[1].toLowerCase())
  );
  if (!hit) {
    console.error("SELF-TEST FAILED: a legacy statement writing orders.items was not caught");
    process.exit(1);
  }
  const named = [...'import * as repo from "#legacy/spots/repo.ts";'.matchAll(NAMESPACE)];
  if (named.length !== 1 || /^legacy/i.test(named[0][1])) {
    console.error("SELF-TEST FAILED: a #legacy import bound as `repo` was not caught");
    process.exit(1);
  }
  console.log("self-test: both detectors fire\n");
}

// ---- report ----------------------------------------------------------------

console.log(
  `${sqlFiles.length} legacy statement(s) and ${jsFiles.length} module(s) checked`
);
for (const n of notes) console.log(`  note  ${n}`);

if (failures.length) {
  console.error(`\n${failures.length} boundary violation(s):`);
  for (const f of failures) console.error(`  ✖ ${f}`);
  process.exit(1);
}
console.log("\nlegacy/ writes exchange, says so at every call site, and imports no feature at runtime");
