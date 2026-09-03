// Every pinned test that writes a lock-ordered table must pass `locks.ts`'s
// lock at that call.
//
// *** WHY THIS EXISTS. *** `shared/testing/locks.ts` documents the failure
// mode itself: a missing lock is latent until test timing changes elsewhere,
// and it just did. Of 269 `inPinnedTransaction` calls in 59 files, 190 passed
// no lock option at all, and the second audit run of the redesign
// (docs/waves/test-suite-redesign.md, 1.2) failed 997/998 -
// `domain/orders/tests/refiner-edits.test.ts` raised `deadlock detected`
// (40P01) because 3 of its 10 calls carried no lock while
// `place-purchase.test.ts` placed whole purchase orders across 8 calls with
// none at all. Both files are fixed by hand in the same pass that adds this
// script; this is what stops the fix from rotting back to zero.
//
// *** THE SHAPE. *** Two graphs, built from the real tree every run rather
// than hand-maintained:
//   1. TABLE_LOCKS / WILDCARD_SCHEMA_LOCKS transcribe locks.ts's own
//      documentation comments - which tables each of the five advisory locks
//      protects. This is the one part that cannot be derived, because the
//      association lives in prose, not in a type.
//   2. Every `db/**/*.ts` and `domain/**/*.ts` file (excluding tests) is
//      walked for what it WRITES - either a literal `INSERT INTO` / `UPDATE`
//      / `DELETE FROM schema.table` inside a backtick SQL string (inline, or
//      in a repo's sibling `sql/*.sql` file), or `buildUpdate({ table:
//      "schema.table", ... })`, the one generic update the CRUD ruling left
//      behind. Each file's own writes are unioned with every write reachable
//      through its own imports (`import ... from` and `await import(...)`,
//      both `#db/`/`#domain/`-rooted and relative), so a service that pulls in
//      a dozen repos inherits every lock any of them needs - which is exactly
//      how `place-purchase.test.ts` needs LOCKS.ORDERS despite importing
//      `#domain/orders/place.ts`, not a repo, directly.
//
// A test FILE's required lock set is the union of what its own imports
// resolve to. Every `inPinnedTransaction` call in a file with a non-empty
// required set must carry a `lock:` option - presence, not which one; this
// catches "passes no lock options at all", which is the defect that shipped.
//
// *** WHAT IT CANNOT SEE, on purpose - narrow beats wrong. ***
//   - A test file that reaches a locked table ONLY through HTTP
//     (`request(app)...`) without ever importing the domain module that owns
//     the write. `refiner-edits.test.ts` is exactly this shape - it imports
//     only `#app` and drives every write through supertest, so this script
//     cannot derive a requirement for it at all. Its 10 calls are fixed by
//     hand for that reason, not by this script's detection - see the file
//     itself, and 1.2/1.3 of the redesign doc for why HTTP-layer detection was
//     out of scope for lane 0.
//   - Multiple `inPinnedTransaction` calls inside the SAME `test(...)` block
//     share one ACCEPTED key (by occurrence index) - moving one without the
//     other inside a test would not be caught here.
//   - A cycle in the db/domain import graph returns an empty set for the
//     edge that closes it rather than looping; none is known to exist today.
//
// Run: pnpm --filter @dorado/api lint:test-locks
//      pnpm --filter @dorado/api lint:test-locks --self-test
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { LOCKS } from "#shared/testing/locks.ts";

const ROOT = process.env.LINT_TEST_LOCKS_ROOT ?? path.resolve(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const repoWithLockedWrite = `
    import query from "#shared/db/query.ts";
    export async function place(id, executor) {
      return query(\`INSERT INTO orders.orders (id) VALUES ($1)\`, [id], executor);
    }
  `;
  const serviceImportingRepo = `
    import * as ordersRepo from "#db/orders/repo.ts";
    export async function place(id, executor) { return ordersRepo.place(id, executor); }
  `;
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a pinned call in a file importing a locked-table service, with no lock option, fails",
        rootEnv: "LINT_TEST_LOCKS_ROOT",
        files: {
          "db/orders/repo.ts": repoWithLockedWrite,
          "domain/orders/place.ts": serviceImportingRepo,
          "domain/orders/tests/place.test.ts": `
            import test from "node:test";
            import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
            const place = await import("#domain/orders/place.ts");
            test("places an order", async () => {
              await inPinnedTransaction(async (c) => {
                await place.place("1", c);
              });
            });
          `,
        },
        expect: "fail",
        mustPrint: "domain/orders/tests/place.test.ts",
      },
      {
        name: "the same call WITH a lock option passes",
        rootEnv: "LINT_TEST_LOCKS_ROOT",
        files: {
          "db/orders/repo.ts": repoWithLockedWrite,
          "domain/orders/place.ts": serviceImportingRepo,
          "domain/orders/tests/place.test.ts": `
            import test from "node:test";
            import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
            import { LOCKS } from "#shared/testing/locks.ts";
            const place = await import("#domain/orders/place.ts");
            test("places an order", async () => {
              await inPinnedTransaction(async (c) => {
                await place.place("1", c);
              }, { lock: LOCKS.ORDERS });
            });
          `,
        },
        expect: "pass",
        mustPrint: "0 unaccepted",
      },
    ],
  });
}

const SELF_TEST_MODE = process.env.LINT_TEST_LOCKS_ROOT != null;

// *** TABLE -> LOCK, TRANSCRIBED FROM locks.ts's OWN COMMENTS. *** Cannot be
// derived - the association lives in prose next to each numeric id, not in a
// type. Keep this in step with shared/testing/locks.ts by hand; a table this
// map does not know about is simply unlocked as far as this script can tell,
// which is the same "narrow beats wrong" trade-off SCRAP_SWEEP's own history
// makes: exchange.scrap and (what locks.ts calls) checkout.sell_cart_items are
// pre-D212 tables nothing currently writes, and are listed anyway because a
// table growing a writer back is exactly the case a stale map would miss
// silently.
const EXACT_TABLE_LOCKS: Record<string, number> = {
  "checkout.sell_cart_items": LOCKS.SCRAP_SWEEP,
  "exchange.sell_cart_items": LOCKS.SCRAP_SWEEP,
  "exchange.scrap": LOCKS.SCRAP_SWEEP,
  "fulfillments.fulfillments": LOCKS.FULFILLMENTS,
  "fulfillments.pickups": LOCKS.FULFILLMENTS,
  "fulfillments.directs": LOCKS.FULFILLMENTS,
  "fulfillments.shipments": LOCKS.FULFILLMENTS,
  "exchange.purchase_orders": LOCKS.ORDERS,
  "exchange.sales_orders": LOCKS.ORDERS,
  "exchange.addresses": LOCKS.ADDRESSES,
  "places.addresses": LOCKS.ADDRESSES,
  "places.user_addresses": LOCKS.ADDRESSES,
  "exchange.users": LOCKS.USERS,
  "auth.users": LOCKS.USERS,
};
// "orders.*, refiners.* (written by the order-placing paths), checkout.*" -
// full-schema wildcards, unlike FULFILLMENTS' four named tables above.
const WILDCARD_SCHEMA_LOCKS: Record<string, number> = {
  orders: LOCKS.ORDERS,
  refiners: LOCKS.ORDERS,
  checkout: LOCKS.ORDERS,
};

function lockFor(schemaTable: string): number | null {
  if (EXACT_TABLE_LOCKS[schemaTable] != null) return EXACT_TABLE_LOCKS[schemaTable];
  const schema = schemaTable.split(".")[0]!;
  return WILDCARD_SCHEMA_LOCKS[schema] ?? null;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "migrations") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

// Every backtick template literal's contents - deliberately crude (no
// interpolation awareness) since the SQL keywords this looks for always sit
// before the first `${`.
function templateBodies(src: string): string[] {
  const out: string[] = [];
  const re = /`((?:\\.|[^`\\])*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!);
  return out;
}

const WRITE_RE = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)/gi;
const BUILD_UPDATE_RE = /buildUpdate\s*\(\s*\{[\s\S]{0,300}?table:\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;

function tablesWrittenBy(text: string): Set<string> {
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  WRITE_RE.lastIndex = 0;
  while ((m = WRITE_RE.exec(text))) tables.add(m[2]!.toLowerCase());
  BUILD_UPDATE_RE.lastIndex = 0;
  while ((m = BUILD_UPDATE_RE.exec(text))) tables.add(m[1]!.toLowerCase());
  return tables;
}

// This file's OWN writes - inline SQL, buildUpdate, and (for a repo.ts) its
// sibling sql/*.sql directory.
function ownLocks(absFile: string): Set<number> {
  const locks = new Set<number>();
  const src = readFileSync(absFile, "utf8");
  const inline = new Set<string>();
  for (const body of templateBodies(src)) for (const t of tablesWrittenBy(body)) inline.add(t);
  for (const t of tablesWrittenBy(src)) inline.add(t); // buildUpdate's plain-quoted table:

  if (/\/repo(\.\w+)?\.ts$/.test(absFile)) {
    const sqlDir = path.join(path.dirname(absFile), "sql");
    if (existsSync(sqlDir)) {
      for (const f of readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))) {
        const body = readFileSync(path.join(sqlDir, f), "utf8")
          .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        for (const t of tablesWrittenBy(body)) inline.add(t);
      }
    }
  }
  for (const t of inline) {
    const l = lockFor(t);
    if (l != null) locks.add(l);
  }
  return locks;
}

// "#db/x/repo.ts" / "./repo.ts" -> "db/x/repo.ts", relative to ROOT. Only
// db/ and domain/ are graph territory - #shared, #providers and #transport
// name no table and are not followed.
function resolveSpecifier(fromRel: string, spec: string): string | null {
  if (spec.startsWith("#db/") || spec.startsWith("#domain/")) return spec.slice(1);
  if (spec.startsWith(".")) {
    return path.normalize(path.join(path.dirname(fromRel), spec)).split(path.sep).join("/");
  }
  return null;
}

const IMPORT_RE = /\bimport\s+(?:type\s+)?[^;()'"]*?\bfrom\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(src: string): string[] {
  const specs: string[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) specs.push(m[1]!);
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(src))) specs.push(m[1]!);
  return specs;
}

// db/ and domain/ files, excluding tests - the module graph this script
// reasons about. A repo/service outside this (transport/, shared/) writes no
// table of its own as far as EXACT_TABLE_LOCKS/WILDCARD_SCHEMA_LOCKS know.
const graphFiles = ["db", "domain"]
  .flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\/tests\//.test(f));
const graphByRel = new Map(graphFiles.map((f) => [rel(f), f]));

const locksMemo = new Map<string, Set<number>>();
function computeLocks(fileRel: string, visiting: Set<string> = new Set()): Set<number> {
  const cached = locksMemo.get(fileRel);
  if (cached) return cached;
  if (visiting.has(fileRel)) return new Set(); // cycle - contributes nothing at the closing edge
  const abs = graphByRel.get(fileRel);
  if (!abs) return new Set();

  visiting.add(fileRel);
  const result = new Set(ownLocks(abs));
  const src = readFileSync(abs, "utf8");
  for (const spec of importsOf(src)) {
    const target = resolveSpecifier(fileRel, spec);
    if (!target || target === fileRel) continue;
    for (const l of computeLocks(target, visiting)) result.add(l);
  }
  visiting.delete(fileRel);
  locksMemo.set(fileRel, result);
  return result;
}

// Every db/domain file's locks, computed once - this is also the source of
// the known-present control below.
for (const f of graphByRel.keys()) computeLocks(f);

// -------------------------------------------------- the test files

const testFiles = walk(ROOT)
  .filter((f) => /\.test\.ts$/.test(f))
  .map((f) => ({ abs: f, rel: rel(f) }));

// A pinned call with no lock option that a genuinely read-only test needs -
// keyed by `<file>::<enclosing test description>#<occurrence index within
// it>`, NOT by line, so a reformat does not silently drop an acceptance (the
// same reasoning audit-silent-mutations' ACCEPTED gives for its own keys).
const ACCEPTED: Record<string, string> = {};
const acceptedHit = new Set<string>();

// COMMENTS MUST BE SKIPPED BEFORE QUOTES ARE EVEN CONSIDERED. An apostrophe in
// a `//` line comment ("the CALLER'S book") is not a string delimiter, but a
// naive scanner cannot tell - it opens a "string" there and does not close it
// until the NEXT apostrophe, anywhere, however far away. That swallowed three
// whole test bodies into one call's span on the first version of this
// function, corrupting a mechanical rewrite of otherwise-correct code (caught
// before it was applied - see the lane 0 report). `//` and `/* */` are
// stripped from consideration first, in the same left-to-right pass.
function balancedCall(src: string, openParenIdx: number): string {
  let i = openParenIdx + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < src.length && src[i] !== quote) { if (src[i] === "\\") i += 1; i += 1; }
    }
    i += 1;
  }
  return src.slice(openParenIdx, i);
}

function enclosingTestName(src: string, callIdx: number): string {
  const re = /\btest(?:\.\w+)?\s*\(\s*["'`]([^"'`]*)["'`]/g;
  let last = "(module scope)";
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && m.index < callIdx) last = m[1]!;
  return last;
}

let checked = 0;
let findings = 0;
const findingLines: string[] = [];
const testNameOccurrence = new Map<string, number>();

for (const { abs, rel: fileRel } of testFiles) {
  const src = readFileSync(abs, "utf8");

  const requiredLocks = new Set<number>();
  for (const spec of importsOf(src)) {
    const target = resolveSpecifier(fileRel, spec);
    if (!target) continue;
    for (const l of computeLocks(target)) requiredLocks.add(l);
  }
  if (requiredLocks.size === 0) continue; // this script has no lock to require here

  const callRe = /inPinnedTransaction\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src))) {
    checked += 1;
    const openParen = callRe.lastIndex - 1;
    const callText = balancedCall(src, openParen);
    const hasLock = /\block\s*:/.test(callText);
    if (hasLock) continue;

    const testName = enclosingTestName(src, m.index);
    const occKey = `${fileRel}::${testName}`;
    const occ = (testNameOccurrence.get(occKey) ?? 0) + 1;
    testNameOccurrence.set(occKey, occ);
    const key = `${occKey}#${occ}`;

    if (ACCEPTED[key]) { acceptedHit.add(key); continue; }

    const line = src.slice(0, m.index).split("\n").length;
    findings += 1;
    findingLines.push(
      `  ${fileRel}:${line}\n` +
      `    test "${testName}" - required lock(s) [${[...requiredLocks].sort((a, b) => a - b).join(", ")}], call passes none`
    );
  }
}

console.log(`${graphFiles.length} db/domain module(s), ${testFiles.length} test file(s) walked, ${checked} inPinnedTransaction call(s) in lock-requiring files checked\n`);
for (const f of findingLines) console.log(f);
console.log(`\n${findings} unaccepted finding(s), ${acceptedHit.size} accepted`);
for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`);
}

const staleAccepted = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (staleAccepted.length && !SELF_TEST_MODE) {
  console.error(`\n${staleAccepted.length} ACCEPTED entr(y/ies) matched no call - remove them:`);
  for (const k of staleAccepted) console.error(`  ${k}`);
  process.exit(1);
}

if (SELF_TEST_MODE) {
  process.exit(findings > 0 ? 1 : 0);
}

// THE FLOOR. Fewer than 100 test files means the walk is broken, not the
// suite clean - matching audit-query-paths' reasoning: a scan that finds
// nothing must not report success.
const FLOOR = Number(process.env.LINT_TEST_LOCKS_FLOOR ?? 100);
if (testFiles.length < FLOOR) {
  console.error(`\nonly ${testFiles.length} test file(s) found - the walk is broken, not the suite clean`);
  process.exit(1);
}

// THE KNOWN-PRESENT CONTROL. db/orders/repo.ts writes orders.orders - if this
// script cannot attribute LOCKS.ORDERS to that one real, unambiguous file, the
// resolution pipeline (SQL scan, buildUpdate scan, or table->lock map) is
// broken and every other finding here is meaningless.
const CONTROL_FILE = "db/orders/repo.ts";
const controlLocks = computeLocks(CONTROL_FILE);
if (!controlLocks.has(LOCKS.ORDERS)) {
  console.error(
    `\nthe known-present control failed: ${CONTROL_FILE} writes orders.orders and ` +
    `must resolve to LOCKS.ORDERS (got [${[...controlLocks].join(", ")}]) - the scan is broken`
  );
  process.exit(1);
}

if (findings > 0) process.exit(1);
