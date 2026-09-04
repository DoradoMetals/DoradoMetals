import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_TEST_ACTOR_ROOT ?? path.resolve(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const auditedRepo = `
    import query from "#shared/db/query.ts";
    export async function create(id, executor) {
      return query(\`INSERT INTO reviews.reviews (id) VALUES ($1)\`, [id], executor);
    }
  `;
  const migration = `
    CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON reviews.reviews
      FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
  `;
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a pinned call in a file importing an audited-table repo, with no actor, fails",
        rootEnv: "LINT_TEST_ACTOR_ROOT",
        files: {
          "migrations/116_the_database_stamps_who_and_when.sql": migration,
          "db/reviews/repo.ts": auditedRepo,
          "domain/reviews/tests/repo.test.ts": `
            import { test } from "vitest";
            import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
            import * as reviews from "#db/reviews/repo.ts";
            test("writes a review", async () => {
              await inPinnedTransaction(async (c) => { await reviews.create("1", c); });
            });
          `,
        },
        expect: "fail",
        mustPrint: "domain/reviews/tests/repo.test.ts",
      },
      {
        name: "the same call WITH an actor passes",
        rootEnv: "LINT_TEST_ACTOR_ROOT",
        files: {
          "migrations/116_the_database_stamps_who_and_when.sql": migration,
          "db/reviews/repo.ts": auditedRepo,
          "domain/reviews/tests/repo.test.ts": `
            import { test } from "vitest";
            import { inPinnedTransaction } from "#shared/testing/pinned-pool.ts";
            import { TEST_ACTOR } from "#shared/testing/actor.ts";
            import * as reviews from "#db/reviews/repo.ts";
            test("writes a review", async () => {
              await inPinnedTransaction(
                async (c) => { await reviews.create("1", c); },
                { actor: TEST_ACTOR.id }
              );
            });
          `,
        },
        expect: "pass",
        mustPrint: "0 unaccepted",
      },
    ],
  });
}

const SELF_TEST_MODE = process.env.LINT_TEST_ACTOR_ROOT != null;

function auditedTables(): Set<string> {
  const dir = path.join(ROOT, "migrations");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => /audit|stamp/i.test(f) && f.endsWith(".sql"))
    : [];
  const tables = new Set<string>();
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), "utf8");
    const re =
      /CREATE (?:OR REPLACE )?TRIGGER\s+audit_stamp\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+([a-z_]+\.[a-z_]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) tables.add(m[1]!.toLowerCase());
  }
  return tables;
}

const AUDITED = auditedTables();

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

const WRITE_RE =
  /\b(INSERT INTO|UPDATE|DELETE FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)/gi;
const BUILD_UPDATE_RE =
  /buildUpdate\s*\(\s*\{[\s\S]{0,300}?table:\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;

function tablesWrittenBy(text: string): Set<string> {
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  WRITE_RE.lastIndex = 0;
  while ((m = WRITE_RE.exec(text))) tables.add(m[2]!.toLowerCase());
  BUILD_UPDATE_RE.lastIndex = 0;
  while ((m = BUILD_UPDATE_RE.exec(text))) tables.add(m[1]!.toLowerCase());
  return tables;
}

function ownAudited(absFile: string): Set<string> {
  const src = readFileSync(absFile, "utf8");
  const written = new Set<string>();
  for (const body of templateBodies(src)) for (const t of tablesWrittenBy(body)) written.add(t);
  for (const t of tablesWrittenBy(src)) written.add(t);

  if (/\/repo(\.\w+)?\.ts$/.test(absFile)) {
    const sqlDir = path.join(path.dirname(absFile), "sql");
    if (existsSync(sqlDir)) {
      for (const f of readdirSync(sqlDir).filter((n) => n.endsWith(".sql"))) {
        const body = readFileSync(path.join(sqlDir, f), "utf8")
          .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        for (const t of tablesWrittenBy(body)) written.add(t);
      }
    }
  }
  return new Set([...written].filter((t) => AUDITED.has(t)));
}

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

const graphFiles = ["db", "domain"]
  .flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\/tests\//.test(f));
const graphByRel = new Map(graphFiles.map((f) => [rel(f), f]));

const memo = new Map<string, Set<string>>();
function auditedFor(fileRel: string, visiting: Set<string> = new Set()): Set<string> {
  const cached = memo.get(fileRel);
  if (cached) return cached;
  if (visiting.has(fileRel)) return new Set();
  const abs = graphByRel.get(fileRel);
  if (!abs) return new Set();

  visiting.add(fileRel);
  const result = new Set(ownAudited(abs));
  for (const spec of importsOf(readFileSync(abs, "utf8"))) {
    const target = resolveSpecifier(fileRel, spec);
    if (!target || target === fileRel) continue;
    for (const t of auditedFor(target, visiting)) result.add(t);
  }
  visiting.delete(fileRel);
  memo.set(fileRel, result);
  return result;
}
for (const f of graphByRel.keys()) auditedFor(f);

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

const testFiles = walk(ROOT)
  .filter((f) => /\.test\.ts$/.test(f))
  .map((f) => ({ abs: f, rel: rel(f) }));

let checked = 0;
let findings = 0;
const lines: string[] = [];
const occurrences = new Map<string, number>();

for (const { abs, rel: fileRel } of testFiles) {
  const src = readFileSync(abs, "utf8");

  const required = new Set<string>();
  for (const spec of importsOf(src)) {
    const target = resolveSpecifier(fileRel, spec);
    if (!target) continue;
    for (const t of auditedFor(target)) required.add(t);
  }
  if (required.size === 0) continue;

  const callRe = /inPinnedTransaction\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src))) {
    checked += 1;
    const callText = balancedCall(src, callRe.lastIndex - 1);
    if (/\bactor\s*:/.test(callText)) continue;

    const testName = enclosingTestName(src, m.index);
    const occKey = `${fileRel}::${testName}`;
    const occ = (occurrences.get(occKey) ?? 0) + 1;
    occurrences.set(occKey, occ);
    const key = `${occKey}#${occ}`;
    if (ACCEPTED[key]) { acceptedHit.add(key); continue; }

    const line = src.slice(0, m.index).split("\n").length;
    findings += 1;
    lines.push(
      `  ${fileRel}:${line}\n` +
      `    test "${testName}" - writes audited table(s) ` +
      `[${[...required].sort().slice(0, 4).join(", ")}${required.size > 4 ? ", ..." : ""}]` +
      `, call names no actor`
    );
  }
}

console.log(
  `${AUDITED.size} audited table(s) from migration 116, ${graphFiles.length} db/domain ` +
  `module(s), ${testFiles.length} test file(s) walked, ${checked} inPinnedTransaction ` +
  `call(s) in audited-write files checked\n`
);
for (const l of lines) console.log(l);
console.log(`\n${findings} unaccepted finding(s), ${acceptedHit.size} accepted`);
for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`);
}

const stale = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (stale.length && !SELF_TEST_MODE) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched no call - remove them:`);
  for (const k of stale) console.error(`  ${k}`);
  process.exit(1);
}

if (SELF_TEST_MODE) process.exit(findings > 0 ? 1 : 0);

const TABLE_FLOOR = Number(process.env.LINT_TEST_ACTOR_TABLE_FLOOR ?? 20);
if (AUDITED.size < TABLE_FLOOR) {
  console.error(
    `\nonly ${AUDITED.size} audited table(s) found in migrations/ - migration 116 declares ` +
    `26, so the trigger scan is broken rather than the schema shrunk`
  );
  process.exit(1);
}
const FILE_FLOOR = Number(process.env.LINT_TEST_ACTOR_FILE_FLOOR ?? 100);
if (testFiles.length < FILE_FLOOR) {
  console.error(`\nonly ${testFiles.length} test file(s) found - the walk is broken`);
  process.exit(1);
}

const CONTROL = "db/reviews/repo.ts";
if (!auditedFor(CONTROL).has("reviews.reviews")) {
  console.error(
    `\nthe known-present control failed: ${CONTROL} writes reviews.reviews and must ` +
    `resolve as audited (got [${[...auditedFor(CONTROL)].join(", ")}]) - the scan is broken`
  );
  process.exit(1);
}

if (findings > 0) process.exit(1);
