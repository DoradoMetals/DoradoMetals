import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { domainDirs } from "./lib/layout.ts";
import { LOCKS } from "#shared/testing/locks.ts";

const ROOT = process.env.LINT_TEST_LOCKS_ROOT ?? path.resolve(import.meta.dirname, "..");

const GRAPH_ROOTS = ["db", ...domainDirs(ROOT)];

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
          "package.json": JSON.stringify({ imports: { "#orders/*": "./orders/*" } }),
          "db/orders/repo.ts": repoWithLockedWrite,
          "orders/place.ts": serviceImportingRepo,
          "orders/tests/place.test.ts": `
            import test from "node:test";
            import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
            const place = await import("#orders/place.ts");
            test("places an order", async () => {
              await inPinnedTransaction(async (c) => {
                await place.place("1", c);
              });
            });
          `,
        },
        expect: "fail",
        mustPrint: "orders/tests/place.test.ts",
      },
      {
        name: "the same call WITH a lock option passes",
        rootEnv: "LINT_TEST_LOCKS_ROOT",
        files: {
          "package.json": JSON.stringify({ imports: { "#orders/*": "./orders/*" } }),
          "db/orders/repo.ts": repoWithLockedWrite,
          "orders/place.ts": serviceImportingRepo,
          "orders/tests/place.test.ts": `
            import test from "node:test";
            import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
            import { LOCKS } from "#shared/testing/locks.ts";
            const place = await import("#orders/place.ts");
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

function ownLocks(absFile: string): Set<number> {
  const locks = new Set<number>();
  const src = readFileSync(absFile, "utf8");
  const inline = new Set<string>();
  for (const body of templateBodies(src)) for (const t of tablesWrittenBy(body)) inline.add(t);
  for (const t of tablesWrittenBy(src)) inline.add(t);

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

function resolveSpecifier(fromRel: string, spec: string): string | null {
  const head = /^#([^/]+)\//.exec(spec)?.[1];
  if (head && GRAPH_ROOTS.includes(head)) return spec.slice(1);
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

const graphFiles = GRAPH_ROOTS
  .flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\/tests\//.test(f));
const graphByRel = new Map(graphFiles.map((f) => [rel(f), f]));

const locksMemo = new Map<string, Set<number>>();
function computeLocks(fileRel: string, visiting: Set<string> = new Set()): Set<number> {
  const cached = locksMemo.get(fileRel);
  if (cached) return cached;
  if (visiting.has(fileRel)) return new Set();
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

for (const f of graphByRel.keys()) computeLocks(f);

const testFiles = walk(ROOT)
  .filter((f) => /\.test\.ts$/.test(f))
  .map((f) => ({ abs: f, rel: rel(f) }));

const ACCEPTED: Record<string, string> = {};
const acceptedHit = new Set<string>();

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
  if (requiredLocks.size === 0) continue;

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

const FLOOR = Number(process.env.LINT_TEST_LOCKS_FLOOR ?? 100);
if (testFiles.length < FLOOR) {
  console.error(`\nonly ${testFiles.length} test file(s) found - the walk is broken, not the suite clean`);
  process.exit(1);
}

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
