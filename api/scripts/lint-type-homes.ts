import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_TYPE_HOMES_ROOT ?? path.resolve(import.meta.dirname, "..");

const ROOTS = ["db", "domain"];

const SMALL_FEATURES =
  "the small-features lane owns this file (refiners, leads, reviews, media, " +
  "sales-tax, transactions); its declarations are its own pass to remove";

const ACCEPTED: Record<string, { count: number; why: string }> = {
  "db/leads/repo.ts": { count: 1, why: SMALL_FEATURES },
  "db/media/emails/repo.ts": { count: 1, why: SMALL_FEATURES },
  "db/media/images/repo.ts": { count: 1, why: SMALL_FEATURES },
  "db/media/pdfs/repo.ts": { count: 2, why: SMALL_FEATURES },
  "db/refiners/items/repo.ts": { count: 2, why: SMALL_FEATURES },
  "db/refiners/orders/repo.ts": { count: 2, why: SMALL_FEATURES },
  "db/refiners/spots/repo.ts": { count: 6, why: SMALL_FEATURES },
  "db/reviews/repo.ts": { count: 1, why: SMALL_FEATURES },
  "db/sales-tax/repo.ts": { count: 1, why: SMALL_FEATURES },
  "domain/media/emails/record.ts": { count: 4, why: SMALL_FEATURES },
  "domain/media/emails/utils/renderEmail.ts": { count: 2, why: SMALL_FEATURES },
  "domain/media/pdfs/render/layout.ts": { count: 1, why: SMALL_FEATURES },
  "domain/media/pdfs/render/sections.ts": { count: 2, why: SMALL_FEATURES },
  "domain/media/pdfs/serve.ts": { count: 3, why: SMALL_FEATURES },
  "domain/media/pdfs/service.ts": { count: 3, why: SMALL_FEATURES },
  "domain/media/pdfs/store.ts": { count: 2, why: SMALL_FEATURES },
  "domain/refiners/service.ts": { count: 1, why: SMALL_FEATURES },
  "domain/refiners/spots/service.ts": { count: 1, why: SMALL_FEATURES },
  "domain/sales-tax/match.ts": { count: 1, why: SMALL_FEATURES },
  "domain/sales-tax/service.ts": { count: 2, why: SMALL_FEATURES },
};

const acceptedHit = new Map<string, number>();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "tests") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(full) && !/\.d\.ts$/.test(full) && !/\.test\.ts$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const DERIVING =
  /\b(?:Pick|Omit|Partial|Required|Readonly|Record|Parameters|ReturnType|Awaited|NonNullable|Extract|Exclude|InstanceType|keyof|typeof)\b/;

type Finding = { file: string; line: number; text: string; why: string };

function findingsIn(src: string, file: string): Finding[] {
  const out: Finding[] = [];
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;

  const reexport = /(?:^|\n)\s*export\s+type\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/g;
  const reexported = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = reexport.exec(src))) {
    const line = lineOf(m.index);
    if (m[1] === "@dorado/contracts") reexported.add(line);
    else {
      out.push({
        file, line, text: m[0].trim().replace(/\s+/g, " "),
        why: `re-exports a type from ${m[1]} - only @dorado/contracts is a home`,
      });
    }
  }

  const typeRe = /(?:^|\n)(\s*)(export\s+)?type\s+(\w+)(?:<[^=]*>)?\s*=/g;
  while ((m = typeRe.exec(src))) {
    const line = lineOf(m.index);
    if (reexported.has(line)) continue;
    const start = typeRe.lastIndex;
    let depth = 0, i = start;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if ("{[(<".includes(c)) depth++;
      else if ("}])>".includes(c)) depth--;
      else if (c === ";" && depth <= 0) break;
    }
    const body = src.slice(start, i).trim().replace(/\s+/g, " ");
    const name = m[3]!;
    if (m[2]) {
      out.push({
        file, line, text: `export type ${name}`,
        why: "an exported type crosses a boundary - it belongs in @dorado/contracts",
      });
    } else if (!DERIVING.test(body)) {
      out.push({
        file, line, text: `type ${name} = ${body.slice(0, 60)}`,
        why: "declares its own shape rather than deriving one from a contract",
      });
    }
  }

  const ifaceRe = /(?:^|\n)\s*(export\s+)?interface\s+(\w+)/g;
  while ((m = ifaceRe.exec(src))) {
    out.push({
      file, line: lineOf(m.index), text: `interface ${m[2]}`,
      why: "an interface always declares a shape - derive it from a contract instead",
    });
  }

  return out;
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      { name: "an exported type in a repo is seen", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "db/orders/repo.ts": "export type NewOrder = { id: string };\n" },
        mustPrint: "NewOrder" },
      { name: "an interface is seen", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "domain/shipping/tracking.ts": "interface ScanEvent { id: string }\n" },
        mustPrint: "ScanEvent" },
      { name: "a hand-written local object type is seen", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "domain/orders/rules.ts": "type SaleLine = { id: string; gross: number };\n" },
        mustPrint: "SaleLine" },
      { name: "a re-export from a repo is seen", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: {
          "domain/orders/read.ts":
            'export type { PricedLine } from "#db/orders/items/repo.ts";\n',
        },
        mustPrint: "PricedLine" },
      { name: "a type-only re-export of a contract passes", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "domain/orders/read.ts": 'export type { Order } from "@dorado/contracts";\n' },
        mustPrint: "0 misplaced" },
      { name: "an unexported derivation of a contract passes", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "domain/orders/rules.ts": 'type Facts = Pick<OrderView, "order" | "items">;\n' },
        mustPrint: "0 misplaced" },
      { name: "a z.infer derivation passes", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "db/rates/repo.ts": "type Row = z.infer<typeof Rate>;\n" },
        mustPrint: "0 misplaced" },
      { name: "an inline parameter type is not a declaration", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: {
          "domain/orders/service.ts":
            "export function f(x: { a: string; b: number }): void {}\n",
        },
        mustPrint: "0 misplaced" },
      { name: "a test file is out of scope", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: { "db/orders/repo.test.ts": "export type Row = { id: string };\n" },
        mustPrint: "0 misplaced" },
      { name: "a walk that finds nothing is BROKEN, not clean", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT",
        files: { "shared/errors.ts": "export class Invalid extends Error {}\n" },
        mustPrint: "SCAN IS BROKEN" },
      { name: "providers are out of scope", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT", env: { LINT_TYPE_HOMES_FLOOR: "0" },
        files: {
          "providers/shipments/adapters/fedex.ts": "type AddressLike = { city?: string };\n",
          "db/orders/repo.ts": 'export type { Order } from "@dorado/contracts";\n',
        },
        mustPrint: "0 misplaced" },
    ],
  });
}

const files = ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
const rel = (f: string) => path.relative(ROOT, f);

const findings: Finding[] = [];
for (const f of files) {
  const name = rel(f);
  const own = findingsIn(readFileSync(f, "utf8"), name);
  if (!own.length) continue;
  if (ACCEPTED[name]) {
    acceptedHit.set(name, own.length);
    continue;
  }
  findings.push(...own);
}

console.log(`${files.length} file(s) scanned under ${ROOTS.map((r) => `${r}/`).join(" and ")}`);
for (const f of findings) {
  console.log(`  MISPLACED  ${f.file}:${f.line}  ${f.text}`);
  console.log(`             ${f.why}`);
}
console.log(
  `\n${findings.length} misplaced type declaration(s), ${acceptedHit.size} file(s) accepted`
);
for (const [name, entry] of Object.entries(ACCEPTED)) {
  console.log(
    `  accepted  ${name}  ${acceptedHit.get(name) ?? 0}/${entry.count}\n            ${entry.why}`
  );
}

const FILE_FLOOR = Number(process.env.LINT_TYPE_HOMES_FLOOR ?? 100);
if (files.length < FILE_FLOOR) {
  console.error(
    `\nSCAN IS BROKEN: ${files.length} file(s) under ${ROOTS.join(", ")}, ` +
      `expected at least ${FILE_FLOOR}`
  );
  process.exit(1);
}

if (!process.env.LINT_TYPE_HOMES_ROOT) {
  const wrong = Object.entries(ACCEPTED).filter(
    ([name, entry]) => (acceptedHit.get(name) ?? 0) !== entry.count
  );
  if (wrong.length) {
    for (const [name, entry] of wrong) {
      console.error(
        `\nACCEPTED ${name}: ${acceptedHit.get(name) ?? 0} declaration(s) found, ` +
          `${entry.count} pinned`
      );
    }
    console.error("update the count, or remove the entry - it can only shrink");
    process.exit(1);
  }
}

if (findings.length) process.exit(1);
