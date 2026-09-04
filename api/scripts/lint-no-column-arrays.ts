// NO HAND-LISTED COLUMN ARRAYS, AND NO ROW ALIASES. Ruling 64 (Jacob,
// 2026-09-04): *"Why do we have to reference arrays of columns so much? That
// shouldn't be a thing."*
//
// *** THE SHAPE. *** A repo that writes
//
//     export const PATCHABLE = ["name", "phone", "email", ...] as const;
//
// has declared the table a second time. The first declaration is the database,
// and @dorado/contracts generates one zod schema per table FROM
// information_schema - so the second one is a copy that nothing compares
// against the original. It goes stale silently: a column renamed in a migration
// leaves a whitelist entry naming a column that no longer exists, and every
// patch through it keeps passing because the key is simply never present.
//
// The derivation says the same thing and cannot drift:
//
//     export const PATCHABLE = columnsOf(LeadPatch);
//     export const PATCHABLE = columnsOf(Order.omit({ id: true, user_id: true, ... }));
//
// A `.pick()` / `.omit()` names the columns too - but as KEYS OF A SCHEMA,
// which zod types against the shape, so naming a column the table does not
// have is a typecheck failure rather than a string nobody reads.
//
// *** AND THE ALIASES. *** `export type LeadRow = Lead;` is the same defect in
// miniature (rulings 60-61: the row IS `Lead`). It gives one type two names,
// so half the code imports the row from a repo and half from the contracts
// package, and a reader has to check they are still the same thing.
//
// *** WHAT IT DOES NOT CLAIM. *** This is a text scan, not a type checker. An
// array is a finding only when EVERY member is a column of ONE contract row -
// two or more members, so `["id"]`, `["purchase", "sale"]` and a list of
// statuses are not findings. It cannot see a column list built by a helper, and
// it does not try: the point is the shape a reader meets in the file.
//
//   node scripts/lint-no-column-arrays.ts
//   node scripts/lint-no-column-arrays.ts --self-test
//
// Exits non-zero on any unaccepted finding, on an ACCEPTED count that has moved
// in EITHER direction, and on an ACCEPTED entry naming a file that is clean or
// gone. Pinned from both sides like lint-no-throw-in-services' ACCEPTED: a new
// column array fails, and fixing one fails until the number comes down with it.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_NO_COLUMN_ARRAYS_ROOT
  ? path.resolve(process.env.LINT_NO_COLUMN_ARRAYS_ROOT)
  : path.join(import.meta.dirname, "..");

// The contracts live beside the API in the workspace. A synthetic tree may
// carry its own `contracts/` instead, which is what the self-test does - the
// scan has to READ a schema to know what a column name is, and a run that
// found no schemas would call every array clean.
const CONTRACTS = existsSync(path.join(ROOT, "contracts"))
  ? path.join(ROOT, "contracts")
  : path.join(ROOT, "..", "packages", "contracts", "src");

// THE FILES THIS LANE DOES NOT OWN. Same rules as
// lint-no-throw-in-services' ACCEPTED: a debt with a name on it, pinned from
// both sides. The places/users lane owns `db/places/**` and `db/users/**` for
// the whole of this pass, so their arrays and aliases are left exactly as the
// cleanup lane found them.
const ACCEPTED: Record<string, { count: number; why: string }> = {
  "db/products/repo.ts": { count: 1, why: "products lane" },
  "db/places/addresses/repo.ts": { count: 2, why: "places/users lane" },
  "db/places/user-addresses/repo.ts": { count: 2, why: "places/users lane" },
  "db/users/repo.ts": { count: 1, why: "places/users lane" },
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === "tests" || e === "sql") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts") && !e.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead: string) => lead);
}

// ------------------------------------------------------------- the contracts

// Every generated entity's column set, and every exported schema NAME (the
// entities plus the hand-written picks below them - both are legitimate
// right-hand sides of a row alias).
const columnsByEntity = new Map<string, Set<string>>();
const schemaNames = new Set<string>();

for (const file of walk(CONTRACTS)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/export const (\w+)\s*=/g)) schemaNames.add(m[1]);

  const start = src.indexOf("// generated:start");
  const end = src.indexOf("// generated:end");
  if (start === -1 || end === -1) continue;
  const generated = src.slice(start, end);
  const entity = /export const (\w+) = z\.object\(\{/.exec(generated);
  if (!entity) continue;
  const columns = new Set<string>();
  for (const m of generated.matchAll(/^\s*"([A-Za-z_][A-Za-z0-9_]*)":/gm)) columns.add(m[1]);
  if (columns.size) columnsByEntity.set(entity[1], columns);
}

// ---------------------------------------------------------------- the checks

const STRING_ARRAY = /\[\s*(?:"[^"\n]*"|'[^'\n]*')(?:\s*,\s*(?:"[^"\n]*"|'[^'\n]*'))*\s*,?\s*\]/g;
const ROW_ALIAS = /(?:export\s+)?type\s+(\w*Row)\s*=\s*(\w+)\s*;/g;

type Finding = { file: string; line: number; what: string };

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

function findingsIn(rel: string, raw: string): Finding[] {
  const src = withoutComments(raw);
  const out: Finding[] = [];

  for (const m of src.matchAll(STRING_ARRAY)) {
    const members = [...m[0].matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map((x) => x[1] ?? x[2]);
    if (members.length < 2) continue;
    for (const [entity, columns] of columnsByEntity) {
      if (members.every((c) => columns.has(c))) {
        out.push({
          file: rel, line: lineOf(src, m.index ?? 0),
          what:
            `a literal array of ${members.length} column name(s) of ${entity} - ` +
            `derive it: columnsOf(${entity}.pick({ ... })) or columnsOf(${entity}Patch)`,
        });
        break;
      }
    }
  }

  for (const m of src.matchAll(ROW_ALIAS)) {
    if (!schemaNames.has(m[2])) continue;
    out.push({
      file: rel, line: lineOf(src, m.index ?? 0),
      what: `type ${m[1]} = ${m[2]} gives one row two names - use ${m[2]} (rulings 60-61)`,
    });
  }

  return out;
}

// ------------------------------------------------------------------ self-test

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const LOW = { LINT_NO_COLUMN_ARRAYS_FLOOR: "1", LINT_NO_COLUMN_ARRAYS_TABLES: "1" };
  // A synthetic contracts package: one generated entity, so the scan has real
  // column names to compare against.
  const contract =
    "// generated:start\n" +
    "export const Widget = z.object({\n" +
    '  "id": z.string(),\n' +
    '  "name": z.string(),\n' +
    '  "colour": z.string(),\n' +
    '  "weight": z.number(),\n' +
    "});\n" +
    "// generated:end\n" +
    "export const WidgetPatch = Widget.pick({ name: true, colour: true });\n";
  // No import in the fixture on purpose: lint:imports reads every specifier in
  // every scripts/ file, this one included, so a path written here would be an
  // unresolved import in real source.
  const clean = "export const PATCHABLE = columnsOf(WidgetPatch);\n";

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a literal array of column names is seen",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts": 'export const PATCHABLE = ["name", "colour"] as const;\n',
        },
        expect: "fail", mustPrint: "db/widgets/repo.ts",
      },
      {
        name: "the same list spread over several lines is seen too",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts":
            "export const PATCHABLE = [\n  \"name\",\n  \"colour\",\n  \"weight\",\n] as const;\n",
        },
        expect: "fail", mustPrint: "3 column name(s)",
      },
      {
        name: "a row alias of a contract is seen",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts": clean + "export type WidgetRow = Widget;\n",
        },
        expect: "fail", mustPrint: "type WidgetRow = Widget",
      },
      {
        name: "an array under domain/ counts as well as one under db/",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "domain/widgets/rules.ts": 'const CHOICES = ["name", "weight"] as const;\n',
        },
        expect: "fail", mustPrint: "domain/widgets/rules.ts",
      },
      {
        name: "the derivation passes",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: { "contracts/widget.ts": contract, "db/widgets/repo.ts": clean },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a list of values that are not columns is not a finding",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts": clean + 'const KINDS = ["purchase", "sale"] as const;\n',
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a single column name is not a list",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts": clean + 'const KEY = ["id"] as const;\n',
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "an array inside a comment is not a finding",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts": '// it used to be ["name", "colour"] as const\n' + clean,
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a test file is not a finding",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: LOW,
        files: {
          "contracts/widget.ts": contract,
          "db/widgets/repo.ts": clean,
          "db/widgets/tests/repo.test.ts": 'const cols = ["name", "colour"];\n',
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a tree with no contracts to compare against is broken, not clean",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: { LINT_NO_COLUMN_ARRAYS_FLOOR: "1" },
        files: { "db/widgets/repo.ts": clean },
        expect: "fail", mustPrint: "no contract",
      },
      {
        name: "the file floor fires on a tree far below it",
        rootEnv: "LINT_NO_COLUMN_ARRAYS_ROOT", env: { LINT_NO_COLUMN_ARRAYS_TABLES: "1" },
        files: { "contracts/widget.ts": contract, "db/widgets/repo.ts": clean },
        expect: "fail", mustPrint: "fewer files",
      },
    ],
  });
}

// ----------------------------------------------------------------- the run

const SYNTHETIC = Boolean(process.env.LINT_NO_COLUMN_ARRAYS_ROOT);
const files = [...walk(path.join(ROOT, "db")), ...walk(path.join(ROOT, "domain"))];

// A scan that read no schemas cannot tell a column name from any other string,
// and would call the whole tree clean.
const TABLES_FLOOR = Number(process.env.LINT_NO_COLUMN_ARRAYS_TABLES ?? 40);
if (columnsByEntity.size < TABLES_FLOOR) {
  console.error(
    `lint:no-column-arrays read ${columnsByEntity.size} contract table(s) from ${CONTRACTS}, ` +
      `fewer than the ${TABLES_FLOOR} it expects. With no contract schemas to compare ` +
      `against, every array looks clean - this is a broken read, not a clean tree.`
  );
  process.exit(1);
}

const FLOOR = Number(process.env.LINT_NO_COLUMN_ARRAYS_FLOOR ?? 130);
if (files.length < FLOOR) {
  console.error(
    `lint:no-column-arrays scanned ${files.length} file(s), fewer files than db/ and ` +
      `domain/ actually hold (at least ${FLOOR}). The walk broke, not the tree shrank.`
  );
  process.exit(1);
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const byFile = new Map<string, Finding[]>();
for (const file of files) {
  const found = findingsIn(rel(file), readFileSync(file, "utf8"));
  if (found.length) byFile.set(rel(file), found);
}

const problems: string[] = [];
const acceptedHit = new Set<string>();

for (const [file, found] of [...byFile].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[file];
  if (!entry) {
    for (const f of found) problems.push(`${f.file}:${f.line}  ${f.what}`);
    continue;
  }
  acceptedHit.add(file);
  if (entry.count !== found.length) {
    problems.push(
      `${file}  ACCEPTED says ${entry.count} finding(s), the file has ${found.length}. ` +
        (found.length < entry.count
          ? `Good - lower the ACCEPTED count to ${found.length} in the same diff.`
          : `A NEW column array or row alias was added to an accepted file.`)
    );
  }
}

console.log(
  `${files.length} file(s) under db/ and domain/ scanned against ` +
    `${columnsByEntity.size} contract table(s)`
);
for (const p of problems) console.error("  " + p);
console.log(`\n${problems.length} unaccepted finding(s), ${acceptedHit.size} accepted file(s)`);

let total = 0;
for (const [file, entry] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(file)) {
    total += entry.count;
    console.log(`  accepted  ${file}  ${entry.count} finding(s) - ${entry.why}`);
  }
}
if (acceptedHit.size) console.log(`  ${total} accepted finding(s) outstanding`);

const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((f) => !acceptedHit.has(f));
if (stale.length) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(", ")}`);
  console.error("remove them - the file is gone, renamed, or already clean");
  process.exit(1);
}

if (problems.length) {
  console.error(
    `\nno-column-arrays failed. Ruling 64: a column list is the contract's, so a\n` +
      `whitelist is columnsOf(<Entity>Patch) or columnsOf(<Entity>.pick({...})), and\n` +
      `a row is its contract type - not a second name for one.`
  );
  process.exit(1);
}

console.log("no-column-arrays passed");
