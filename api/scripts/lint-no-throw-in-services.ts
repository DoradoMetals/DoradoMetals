// NO `throw` IN A SERVICE. Ruling 65 (Jacob, 2026-09-04).
//
// *** THE SHAPE. *** A use case reads, decides and writes. When it also
// carries its own refusals, the decision and the reason for refusing it are
// interleaved line by line, and the file stops reading as the thing it does.
// `fulfillments/service.ts`'s setMethod was six statements of work and four
// throws; `shipping/operations/service.ts`'s getCheckoutRates was five.
//
// So a refusal lives in the feature's `rules.ts` as a named one-liner the use
// case CALLS - `rules.assertSchedulable(f)`, `rules.assertVoidable(s)` - and
// nothing under `domain/` throws anywhere else. That puts every refusal a
// feature can make in one file, testable without Postgres, next to the
// decisions they mirror: an action a view OFFERS and an assert that REFUSES it
// are then two lines apart rather than two files apart.
//
// *** WHY A `rules.ts` CARVE-OUT AND NOT A LIST OF BLESSED FUNCTIONS. *** The
// file is the unit because the file is what a reader opens. A blessed-name
// list would let a throw sit anywhere as long as the function was called
// `assertX`, which is the rule restated as a naming convention and enforces
// nothing about where the reasoning lives.
//
// *** WHAT IT DOES NOT CLAIM. *** This is a text scan, not a type system. It
// sees the keyword `throw` outside comments; it cannot see a refusal expressed
// as `Promise.reject`, and it does not try. The point is the shape of the
// file, and the keyword is what makes that shape visible.
//
//   node scripts/lint-no-throw-in-services.ts
//   node scripts/lint-no-throw-in-services.ts --self-test
//
// Exits non-zero on any unaccepted finding, on an ACCEPTED count that has
// moved in EITHER direction, and on an ACCEPTED entry naming a file that is
// gone. Pinned from both sides like lint-input-shapes' ACCEPTED and
// audit-silent-mutations' CEILING: a new throw fails, and fixing one fails
// until the number comes down with it.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const API_ROOT = process.env.LINT_NO_THROW_ROOT
  ? path.resolve(process.env.LINT_NO_THROW_ROOT)
  : path.join(import.meta.dirname, "..");

const DOMAIN_ROOT = path.join(API_ROOT, "domain");

// EVERY FILE UNDER domain/ THAT STILL THROWS, with the count as it stands and
// the lane that owns it. Each entry is a debt, not a dispensation: a lane that
// edits another lane's service file to satisfy a lint it just introduced is
// how two lanes conflict.
//
// TO CLEAR ONE: move its refusals into that feature's `rules.ts` as named
// asserts and delete the entry. TO LOWER ONE: same, partly - and change the
// number here in the same diff, which is the point of pinning it.
//
// THE PIN HAS EARNED ITS KEEP TWICE. It arrived from the fulfillments lane
// with four payments entries the payments lane had already cleared, so the
// merge failed here on "ACCEPTED entries matched nothing" rather than quietly
// carrying four dispensations for debt that no longer existed. It fired the
// same way when the cleanup lane cleared nineteen of the twenty (2026-09-04,
// rulings 64-65): checkout, orders (service, place, spots), quotes (service,
// profit), refiners (items, orders), media (images, three pdfs), pricing/bid,
// rates (service, compose), leads, reviews and sales-tax each grew or gained a
// `rules.ts` and every throw moved into it.
//
// ONE ENTRY LEFT, and it is somebody else's file: the places/users lane owns
// `domain/places/**` for the whole of this pass. Its four refusals are exactly
// as the cleanup lane found them.
const ACCEPTED: Record<string, { count: number; why: string }> = {
  "domain/places/addresses/service.ts": { count: 4, why: "places/users lane" },
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    // `tests` is where a throw is the SUBJECT - assert.rejects needs one to
    // exist, and a fixture that throws on purpose is not a service.
    if (e === "node_modules" || e === "dist" || e === "tests") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (
      e.endsWith(".ts") && !e.endsWith(".d.ts") && !e.endsWith(".test.ts") &&
      // THE CARVE-OUT, and the only one. A refusal lives here.
      e !== "rules.ts"
    ) out.push(full);
  }
  return out;
}

// Comments are stripped before the keyword is looked for: this file's own
// header says "no `throw` in a service" and would otherwise report itself, and
// every rules.ts reference in a service's comments would be a finding.
function throwLines(src: string): number[] {
  const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const out: number[] = [];
  withoutBlocks.split("\n").forEach((line, i) => {
    if (/\bthrow\b/.test(line.replace(/\/\/.*$/, ""))) out.push(i + 1);
  });
  return out;
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const LOW = { LINT_NO_THROW_FLOOR: "1" };
  const rules =
    'import { NotFound } from "#shared/errors.ts";\n' +
    "export function assertWidget<T>(row: T | null, id: string): asserts row is T {\n" +
    "  if (!row) throw new NotFound(`no widget ${id}`);\n" +
    "}\n";
  // No `#`-rooted import in these fixtures on purpose: lint:imports reads
  // every specifier in every scripts/ file, this one included, and a
  // synthetic `#domain/widgets/rules.ts` would be an unresolved import in
  // real source.
  const service =
    "import * as rules from \"../rules.ts\";\n" +
    "export async function getOne(id: string) {\n" +
    "  const row = await repo.getOne(id);\n" +
    "  rules.assertWidget(row, id);\n" +
    "  return row;\n" +
    "}\n";

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a throw in a service is seen",
        rootEnv: "LINT_NO_THROW_ROOT", env: LOW,
        files: {
          "domain/widgets/rules.ts": rules,
          "domain/widgets/service.ts":
            "export async function getOne(id: string) {\n" +
            "  const row = await repo.getOne(id);\n" +
            "  if (!row) throw new NotFound(`no widget ${id}`);\n" +
            "  return row;\n" +
            "}\n",
        },
        expect: "fail", mustPrint: "domain/widgets/service.ts:3",
      },
      {
        name: "a throw in a non-service file under domain/ is seen too",
        rootEnv: "LINT_NO_THROW_ROOT", env: LOW,
        files: {
          "domain/widgets/rules.ts": rules,
          "domain/widgets/compose.ts": "export function f() { throw new Error('x'); }\n",
        },
        expect: "fail", mustPrint: "domain/widgets/compose.ts",
      },
      {
        name: "the same refusal, moved into rules.ts, passes",
        rootEnv: "LINT_NO_THROW_ROOT", env: LOW,
        files: { "domain/widgets/rules.ts": rules, "domain/widgets/service.ts": service },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a throw in a test file is not a finding",
        rootEnv: "LINT_NO_THROW_ROOT", env: LOW,
        files: {
          "domain/widgets/rules.ts": rules,
          "domain/widgets/service.ts": service,
          "domain/widgets/tests/service.test.ts":
            "test('refuses', () => { throw new Error('boom'); });\n",
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "the word throw inside a comment is not a finding",
        rootEnv: "LINT_NO_THROW_ROOT", env: LOW,
        files: {
          "domain/widgets/rules.ts": rules,
          "domain/widgets/service.ts":
            "// rules.assertWidget will throw when the row is gone.\n" +
            "/* and this block comment mentions throw as well */\n" + service,
        },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "the floor fires on a tree far below it",
        rootEnv: "LINT_NO_THROW_ROOT",
        files: { "domain/widgets/service.ts": service },
        expect: "fail", mustPrint: "fewer files",
      },
      {
        name: "a missing domain/ is a broken walk, not a clean one",
        rootEnv: "LINT_NO_THROW_ROOT", env: LOW,
        files: { "shared/errors.ts": "export class NotFound extends Error {}\n" },
        expect: "fail", mustPrint: "no .ts files",
      },
    ],
  });
}

const SYNTHETIC = Boolean(process.env.LINT_NO_THROW_ROOT);
const files = walk(DOMAIN_ROOT);

if (!existsSync(DOMAIN_ROOT) || files.length === 0) {
  console.error(
    `lint:no-throw-in-services found no .ts files under ${DOMAIN_ROOT} - the walk is ` +
      `broken, not domain/ empty.`
  );
  process.exit(1);
}

const FLOOR = Number(process.env.LINT_NO_THROW_FLOOR ?? 80);
if (files.length < FLOOR) {
  console.error(
    `lint:no-throw-in-services scanned ${files.length} file(s), fewer files than ` +
      `domain/ actually holds (at least ${FLOOR}). The walk broke, not the tree shrank.`
  );
  process.exit(1);
}

const rel = (f: string) => path.relative(API_ROOT, f).split(path.sep).join("/");
const found = new Map<string, number[]>();
for (const file of files) {
  const lines = throwLines(readFileSync(file, "utf8"));
  if (lines.length) found.set(rel(file), lines);
}

const problems: string[] = [];
const acceptedHit = new Set<string>();

for (const [file, lines] of [...found].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[file];
  if (!entry) {
    for (const line of lines) {
      problems.push(
        `${file}:${line}  a refusal belongs in this feature's rules.ts, called as one line`
      );
    }
    continue;
  }
  acceptedHit.add(file);
  if (entry.count !== lines.length) {
    problems.push(
      `${file}  ACCEPTED says ${entry.count} throw(s), the file has ${lines.length}. ` +
        (lines.length < entry.count
          ? `Good - lower the ACCEPTED count to ${lines.length} in the same diff, so the ` +
            `gain cannot be given back silently.`
          : `A NEW throw was added to an accepted file; move it to rules.ts.`)
    );
  }
}

console.log(
  `${files.length} domain file(s) scanned (rules.ts and tests/ excluded by design)`
);
for (const p of problems) console.error("  " + p);
console.log(`\n${problems.length} unaccepted finding(s), ${acceptedHit.size} accepted file(s)`);

let total = 0;
for (const [file, entry] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(file)) {
    total += entry.count;
    console.log(`  accepted  ${file}  ${entry.count} throw(s) - ${entry.why}`);
  }
}
if (acceptedHit.size) console.log(`  ${total} accepted throw(s) outstanding`);

// An entry naming a file that no longer throws (or no longer exists) is a
// stale dispensation, and a stale dispensation is how an accepted list becomes
// a list nobody reads.
const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((f) => !acceptedHit.has(f));
if (stale.length) {
  console.error(
    `\n${stale.length} ACCEPTED entr(y/ies) matched nothing: ${stale.join(", ")}`
  );
  console.error("remove them - the file is gone, renamed, or already clean");
  process.exit(1);
}

if (problems.length) {
  console.error(
    `\nno-throw-in-services failed. Ruling 65: a refusal lives in the feature's\n` +
      `rules.ts as a named one-line assert the use case calls, so a service file\n` +
      `reads as what it does and every refusal a feature can make sits in one\n` +
      `file, testable without Postgres.`
  );
  process.exit(1);
}

console.log("no-throw-in-services passed");
