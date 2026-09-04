// A TYPE HAS EXACTLY ONE HOME, AND IT IS @dorado/contracts.
//
// Jacob, on api/domain/orders/rules.ts after four passes had already been over
// it: *"Well I'm still seeing a lot of types in here so"*. Rulings 57/60/61
// say it outright - every type that crosses a boundary lives in the contracts
// package, the row IS `Order`, a write takes `OrderPatch`, and there is no
// `New*`. This lint is that sentence, enforced.
//
// *** WHAT REPLACED WHAT, AND WHY THE OLD QUESTION WAS TOO WEAK. *** The
// previous version asked "is the same type NAME declared in two files with the
// SAME BODY?" - duplication only. It was true and it was nearly useless: 192
// declarations lived under db/ and domain/ and it reported two of them,
// because a type declared ONCE in the wrong place is not a duplicate. The rule
// is not "declare it once", it is "declare it THERE", so the question this
// asks now is simply: is anything declared here at all?
//
// *** THE TWO ALLOWED FORMS. *** Neither is a declaration of a new shape:
//
//   (a) A TYPE-ONLY RE-EXPORT of a contract -
//         export type { Order } from "@dorado/contracts";
//       which is a pointer, not a second declaration.
//
//   (b) A DERIVATION OF A CONTRACT, IN THE SAME STATEMENT, NOT EXPORTED -
//         type Facts = Pick<OrderView["order"], "direction" | "status">;
//       for a shape genuinely internal to one computation in one file. It must
//       name a contract-derived construct (Pick/Omit/Parameters/ReturnType/
//       z.infer/typeof …) so it MOVES when the contract moves, and it must not
//       be exported - the moment two files need it, it is crossing a boundary
//       and belongs in the package.
//
// Anything else fails: a hand-written object type, an interface, an exported
// alias, a `New<Entity>`, a `*Row`. Function PARAMETERS keep their inline
// structural types - an inline type in a signature is not a declaration and is
// not scanned.
//
// TESTS ARE EXCLUDED, and that is the same scoping decision the old version
// made: this is about where a type LIVES IN THE PRODUCT, and a fixture
// declaring its own `{ id: string }` is scaffolding that deliberately stands
// alone. Including them turned a 2-finding report into a 12-finding one whose
// bulk was fixtures - the false-positive rate that gets a check suppressed
// (shared/testing/locks.ts records that outcome costing a shipped feature).
//
//   node scripts/lint-type-homes.ts
//   node scripts/lint-type-homes.ts --self-test
//
// Exits non-zero on any unaccepted declaration.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_TYPE_HOMES_ROOT ?? path.resolve(import.meta.dirname, "..");

// THE SCANNED ROOTS. `providers/` is deliberately NOT one of them: a provider
// adapter describes somebody else's payload, which is not a column of ours and
// has no business in a package whose whole premise is that every field traces
// to one (packages/contracts/README.md). `shared/` and `transport/` are out for
// the same kind of reason - an Executor alias and an Express-shaped helper are
// plumbing, not a boundary shape.
const ROOTS = ["db", "domain"];

// DECLARATIONS THAT STAY, with a COUNT each, PINNED FROM BOTH SIDES: a file
// listed here with the wrong count fails, and a file that stops having any
// fails too. So the map can only shrink, and it cannot go stale quietly.
//
// EVERY ENTRY BELONGS TO ONE PARALLEL LANE, and this pass deliberately did not
// touch its files: two lanes editing one file is how a merge loses a change.
// Each is the same kind of declaration this pass removed everywhere else - a
// `New<Entity>`, a `*Row`, a projection with no contract behind it - and the
// count is what was there on 2026-09-04.
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

// The constructs that make a type a DERIVATION of something else rather than a
// new shape. `typeof` covers `z.infer<typeof Schema>` and
// `Parameters<typeof fn>[0]`; the mapped-type helpers cover the rest.
const DERIVING =
  /\b(?:Pick|Omit|Partial|Required|Readonly|Record|Parameters|ReturnType|Awaited|NonNullable|Extract|Exclude|InstanceType|keyof|typeof)\b/;

type Finding = { file: string; line: number; text: string; why: string };

// `type X = …;` up to the semicolon that ends it, and `interface X { … }` by
// its name alone. Deliberately not a TypeScript parse: this runs in the gate
// and must not need the compiler API to say something this simple.
function findingsIn(src: string, file: string): Finding[] {
  const out: Finding[] = [];
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;

  // FORM (a) FIRST, and it is recognised by the whole statement rather than by
  // the word `export`: `export type { X } from "@dorado/contracts"` is a
  // re-export, `export type { X } from "#db/…"` is a repo publishing a type of
  // its own through one more hop, which is exactly what these rulings ended.
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

// THE FLOOR. A walk that opens nothing calls the whole tree clean, which is
// what `audit-wire-readiness`' first version did for weeks (it resolved
// `api/frontend` and walked zero files). The self-test lowers it for its
// synthetic trees and keeps ONE case at the real value, so the floor itself is
// proved to fire rather than merely declared.
const FILE_FLOOR = Number(process.env.LINT_TYPE_HOMES_FLOOR ?? 100);
if (files.length < FILE_FLOOR) {
  console.error(
    `\nSCAN IS BROKEN: ${files.length} file(s) under ${ROOTS.join(", ")}, ` +
      `expected at least ${FILE_FLOOR}`
  );
  process.exit(1);
}

if (!process.env.LINT_TYPE_HOMES_ROOT) {
  // PINNED FROM BOTH SIDES. An entry whose file is clean now is stale and is
  // reported; an entry whose count has grown is a lane adding declarations
  // under cover of somebody else's excuse.
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
