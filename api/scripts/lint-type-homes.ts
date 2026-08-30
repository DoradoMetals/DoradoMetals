// A type has exactly one home, and this is phase 3's A4.
//
// *** WHAT IT LOOKS FOR, AND WHY NOT THE OBVIOUS THING. *** The obvious lint is
// "exported iff imported", and phase3-api.md records why that is wrong before it
// was ever written: a repo publishing its own row type is the DESIGN, and
// today's import count is weather. `OrganizationRow` and `RefinerItemRow` became
// unimported purely because A1 moved their consumers, and a lint of that shape
// would have demanded they be un-exported and then demanded they be re-exported
// the next time somebody imported them. It would oscillate.
//
// So this asks a stable question instead: **is the same type NAME declared in
// two files with the SAME BODY?** That is duplication regardless of who imports
// what, it does not move when consumers move, and the fix is always the same -
// give it one home and import it.
//
// *** DIFFERENT BODIES UNDER ONE NAME ARE NOT A FINDING. *** phase3-api.md
// diffed all eleven duplicate names and eight are genuinely different types that
// happen to share a word: `Quote` is all-optional in spots/repo.ts (what the
// provider hands back) and all-required in spots/service.ts (the resolved
// quote), and merging them would be a bug. `PickupInput` is a FedEx request body
// in one place and a table row's input in the other. Reporting those would be
// the false-positive rate that gets a check suppressed - see the note in
// shared/testing/locks.ts about exactly that outcome.
//
//   node scripts/lint-type-homes.ts
//   node scripts/lint-type-homes.ts --self-test
//
// Exits non-zero on an unaccepted identical duplicate.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_TYPE_HOMES_ROOT ?? path.resolve(import.meta.dirname, "..");

// Identical duplicates that stay, with the reason. Keyed by the type name.
// PINNED FROM BOTH SIDES: an entry matching nothing is reported, so collapsing a
// duplicate forces its excuse out of this map rather than leaving it here
// describing something that no longer exists.
const ACCEPTED: Record<string, string> = {
  Executor: "the pg Executor alias. shared/db/executor.ts is its home and 37 " +
    "declarations collapsed into it (A0); the remaining copies are in scripts/, " +
    "which does not import through #shared.",

  Category: "one-line indexed access into a contract - " +
    "fulfillments.MethodsRow['category'] - in three files. THE CONTRACT IS " +
    "ALREADY THE HOME. There is no `Category` a second feature should reach for, " +
    "only MethodsRow['category'], and a shared alias would add a hop without " +
    "adding a source of truth. phase3-api.md reached the same verdict after " +
    "diffing all eleven duplicate names.",

  Direction: "same as Category - NonNullable<fulfillments.MethodsRow" +
    "['direction']> in two files, both indexed access into the contract that " +
    "already owns it. NOTE the two OTHER `Direction` declarations are different " +
    "types and correctly not reported: orders/patch.service.ts indexes " +
    "orders.OrdersRow, and checkout/repo.next.ts's is `typeof SALE | typeof " +
    "PURCHASE`. That the scan separates them is the check working.",

  Window: "THE ONE REAL STRUCTURAL DUPLICATE, and it is accepted deliberately " +
    "rather than because it is harmless. `{ from?, to?, employee_id? }` is " +
    "byte-identical in fulfillments/directs/repo.ts and fulfillments/pickups/" +
    "repo.ts, and unlike the two above it is not an indexed access - if the " +
    "shape changes, both must change and nothing enforces it. Collapsing it " +
    "means one sibling resource importing a type from the other, or from the " +
    "parent, for a single line - which is exactly the coupling rulings 26b/26c " +
    "exist to prevent ('a consumer in another feature can depend on one " +
    "resource without dragging in its siblings'). The duplication is the " +
    "cheaper of the two costs. Revisit if the shape ever grows past one line.",
};

const acceptedHit = new Set<string>();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "migrations") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    // TESTS ARE EXCLUDED, and that is a scoping decision rather than an
    // oversight. A4 is about where a type LIVES in the product; a test file
    // declaring its own little `Row = { id: string }` is scaffolding that
    // deliberately stands alone, and ~20 `replay.test.ts` files each declaring
    // the same two-field helper is not a design problem. Including them turned
    // a 2-finding report into a 12-finding one whose bulk was fixtures - the
    // false-positive rate that gets a check suppressed (locks.ts records that
    // outcome costing a shipped feature).
    else if (/\.ts$/.test(full) && !/\.d\.ts$/.test(full)
             && !/\.test\.ts$/.test(full) && !/[\\/]tests[\\/]/.test(full)) out.push(full);
  }
  return out;
}

// Whitespace and trailing commas carry no meaning here, and two declarations
// that differ only in formatting are the same type. Comments are stripped so a
// re-worded header does not make a duplicate look distinct.
function normalise(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    // A trailing separator before a closer carries no meaning: `{ a; }` and
    // `{ a }` are one type, and so are `{ a, }` and `{ a }`.
    .replace(/[,;]\s*([}\]>])/g, "$1")
    // Then strip whitespace ADJACENT TO DELIMITERS, so `{ a: string }` and
    // `{a:string}` compare equal. Only around punctuation - stripping it
    // generally would fuse `keyof X` into `keyofX`. Without this the previous
    // rule created its own difference: removing `,` from `{ a, }` left
    // `{ a}` against a hand-written `{ a }`, and the two failed to match.
    .replace(/\s*([{}()[\];,:|&<>])\s*/g, "$1")
    .trim();
}

// ALIASES ARE RESOLVED TO THEIR MODULE, and this closes a blind spot the first
// version had. `fulfillments.MethodsRow["category"]` and
// `fulfillmentTables.MethodsRow["category"]` are the SAME TYPE written through
// two different namespace imports of the same module - and a text comparison
// calls them different. That is a false NEGATIVE, which is the direction that
// matters: a lint that quietly misses duplicates is worse than one that reports
// too many, because nothing ever tells you it is asleep.
//
// So each file's `import * as X from "M"` is read, and every `X.` in a body is
// rewritten to `M::` before comparison. Two aliases over one module then
// collide as they should, and two aliases over DIFFERENT modules still do not.
function namespaceAliases(src: string): Map<string, string> {
  const out = new Map<string, string>();

  // import * as X from "M"
  const star = /import\s+(?:type\s+)?\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = star.exec(src))) out.set(m[1]!, `${m[2]!}::${m[1]!}`);

  // import type { a, b as c } from "M"  - the RENAMED form is the one that
  // matters, and missing it was the first version's blind spot:
  // `import type { fulfillments as fulfillmentTables }` and
  // `import type { fulfillments }` name the same thing through two spellings.
  const named = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s+["']([^"']+)["']/g;
  while ((m = named.exec(src))) {
    const mod = m[2]!;
    for (const part of m[1]!.split(",")) {
      const bits = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (bits.length === 2) out.set(bits[1]!.trim(), `${mod}::${bits[0]!.trim()}`);
      else if (bits[0]?.trim()) out.set(bits[0].trim(), `${mod}::${bits[0].trim()}`);
    }
  }
  return out;
}

function resolveAliases(body: string, aliases: Map<string, string>): string {
  let out = body;
  for (const [alias, mod] of aliases) {
    out = out.replace(new RegExp(`\\b${alias}\\.`, "g"), `${mod}::`);
  }
  return out;
}

type Decl = { name: string; file: string; line: number; body: string };

// `type X = ...;` up to the semicolon that ends it, and `interface X { ... }`
// balanced to its closing brace. Deliberately not a TypeScript parse: this runs
// in the gate and must not need the compiler API to say something this simple.
function declarationsIn(src: string, file: string): Decl[] {
  const out: Decl[] = [];
  const aliases = namespaceAliases(src);
  const norm = (t: string) => normalise(resolveAliases(t, aliases));
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;

  const typeRe = /(?:^|\n)\s*(?:export\s+)?type\s+(\w+)(?:<[^=]*>)?\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(src))) {
    const start = typeRe.lastIndex;
    let depth = 0, i = start;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if ("{[(<".includes(c)) depth++;
      else if ("}])>".includes(c)) depth--;
      else if (c === ";" && depth <= 0) break;
    }
    out.push({ name: m[1]!, file, line: lineOf(m.index), body: norm(src.slice(start, i)) });
  }

  const ifaceRe = /(?:^|\n)\s*(?:export\s+)?interface\s+(\w+)(?:<[^{]*>)?\s*\{/g;
  while ((m = ifaceRe.exec(src))) {
    const start = ifaceRe.lastIndex - 1;
    let depth = 0, i = start;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    out.push({ name: m[1]!, file, line: lineOf(m.index), body: norm(src.slice(start, i)) });
  }

  return out;
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const dup = 'export type Thing = { a: string; b: number };\n';
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      { name: "the same type in two files is seen", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT",
        files: { "features/a/x.ts": dup, "features/b/y.ts": dup },
        mustPrint: "Thing" },
      { name: "the same NAME with a different body is not a finding", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT",
        files: {
          "features/a/x.ts": 'export type Thing = { a: string };\n',
          "features/b/y.ts": 'export type Thing = { z: boolean };\n',
        },
        mustPrint: "0 duplicated" },
      { name: "one declaration is not a finding", expect: "pass",
        rootEnv: "LINT_TYPE_HOMES_ROOT",
        files: { "features/a/x.ts": dup },
        mustPrint: "0 duplicated" },
      { name: "formatting differences do not hide a duplicate", expect: "fail",
        rootEnv: "LINT_TYPE_HOMES_ROOT",
        files: {
          "features/a/x.ts": 'export type Thing = { a: string; b: number };\n',
          "features/b/y.ts": 'type Thing = {\n  // a comment\n  a: string;\n  b: number,\n};\n',
        },
        mustPrint: "Thing" },
    ],
  });
}

const files = walk(ROOT);
const rel = (f: string) => path.relative(ROOT, f);

const byName = new Map<string, Decl[]>();
for (const f of files) {
  for (const d of declarationsIn(readFileSync(f, "utf8"), rel(f))) {
    byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  }
}

let findings = 0;
const lines: string[] = [];

for (const [name, decls] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
  if (decls.length < 2) continue;
  // Group by body: only the groups with more than one FILE are duplication.
  const byBody = new Map<string, Decl[]>();
  for (const d of decls) byBody.set(d.body, [...(byBody.get(d.body) ?? []), d]);
  for (const group of byBody.values()) {
    const distinctFiles = [...new Set(group.map((d) => d.file))];
    if (distinctFiles.length < 2) continue;
    if (ACCEPTED[name]) { acceptedHit.add(name); continue; }
    findings += 1;
    lines.push(`  DUPLICATE  ${name}  in ${distinctFiles.length} files, identical`);
    for (const d of group) lines.push(`             ${d.file}:${d.line}`);
  }
}

console.log(`${files.length} file(s) scanned, ${byName.size} type name(s) declared`);
for (const l of lines) console.log(l);
console.log(`\n${findings} duplicated type(s) with no single home, ${acceptedHit.size} accepted`);
for (const [name, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(name)) console.log(`  accepted  ${name}\n            ${why}`);
}

// THE FLOOR. A walk that finds no declarations is broken, not clean.
if (files.length === 0 || byName.size === 0) {
  console.error("\nSCAN IS BROKEN: no .ts files or no type declarations found");
  process.exit(1);
}

const stale = Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (stale.length && !process.env.LINT_TYPE_HOMES_ROOT) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(", ")}`);
  console.error("remove them - the duplicate they excuse is gone");
  process.exit(1);
}

if (findings) process.exit(1);
