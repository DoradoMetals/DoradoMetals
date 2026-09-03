// A domain file names the KIND of refusal, never the HTTP status.
//
// FOLLOWUPS D214 item 11 and shared/errors.ts's own header say this already:
// a use case says what is wrong in the language of the business - not found,
// forbidden, conflict, invalid - and `shared/middleware/errorHandler.ts` is
// the only place that turns a kind into a status. `shared/http/refuse.ts`
// survives for TRANSPORT, where a status IS the subject.
//
// THE FINDING THIS GUARDS (Jacob, 2026-09-03, on shipping/shipments/service.ts
// lines 18-27, a local `interface HttpError` + `badRequest()` helper): "Why
// are things like this sitting in this file? That should at minimum be a
// shared type lmfao". Six domain files did it, nine sites - each one a domain
// file reaching through the layer below it to spell a number a second caller
// (a job, a script, another service) would have had to decode.
//
// So this fails any non-test file under domain/ that:
//   - assigns `.statusCode` on a thrown error,
//   - calls `refuse(` or `refuseWith(`,
//   - imports from `#shared/http/refuse`, or
//   - declares its own `HttpError` type instead of importing shared/errors.ts.
//
// Static only - reads the .ts files, needs no database, runs in the gate.
//
//   pnpm --filter @dorado/api lint:domain-errors
//   pnpm --filter @dorado/api lint:domain-errors --self-test
import fs from "node:fs";
import path from "node:path";

// Overridable ONLY for the self-test, which points the whole script at a
// synthetic tree standing in for domain/ and confirms it still sees a planted
// violation.
const ROOT = process.env.LINT_DOMAIN_ERRORS_ROOT
  ? path.resolve(process.env.LINT_DOMAIN_ERRORS_ROOT)
  : path.join(import.meta.dirname, "..", "domain");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const LOW = { LINT_DOMAIN_ERRORS_FLOOR: "1" };
  const clean =
    'import { NotFound } from "#shared/errors.ts";\n' +
    "export async function getOne(id: string) {\n" +
    "  const row = await repo.getOne(id);\n" +
    "  if (!row) throw new NotFound(`no thing ${id}`);\n" +
    "  return row;\n" +
    "}\n";

  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a statusCode assignment is seen",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          "widgets/service.ts":
            "function notFound(id: string) {\n" +
            "  const err: Error & { statusCode?: number } = new Error(`no widget ${id}`);\n" +
            "  err.statusCode = 404;\n" +
            "  return err;\n" +
            "}\n",
        },
        expect: "fail", mustPrint: "statusCode",
      },
      {
        name: "refuse( is seen",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          "widgets/service.ts":
            'import { refuse } from "#shared/http/refuse.ts";\n' +
            "export function bad() { throw refuse(400, \"nope\"); }\n",
        },
        expect: "fail", mustPrint: "refuse(",
      },
      {
        name: "refuseWith( is seen",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          "widgets/service.ts":
            'import { refuseWith } from "#shared/http/refuse.ts";\n' +
            "export function bad() { refuseWith(409, \"nope\"); }\n",
        },
        expect: "fail", mustPrint: "refuseWith(",
      },
      {
        name: "a local HttpError type is seen even with no statusCode write",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          "widgets/service.ts":
            "interface HttpError extends Error { statusCode?: number }\n" +
            "export function make(): HttpError { return new Error(\"x\"); }\n",
        },
        expect: "fail", mustPrint: "HttpError",
      },
      {
        name: "a violation in a test file is not a finding",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          // A real domain file must exist too - a tree holding only the
          // excluded test file scans zero files, which is the WALK-IS-BROKEN
          // branch, not evidence the exclusion works.
          "widgets/service.ts": clean,
          "widgets/tests/service.test.ts":
            "const err: Error & { statusCode?: number } = new Error(\"x\");\n" +
            "err.statusCode = 404;\n",
        },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "shared/errors.ts kinds are not a finding",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: { "widgets/service.ts": clean },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "the floor fires on a tree far below it",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT",
        files: { "widgets/service.ts": clean },
        expect: "fail", mustPrint: "fewer domain files",
      },
      {
        name: "a missing root is a broken walk, not an empty one",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {}, args: ["--root-must-exist"],
        expect: "fail", mustPrint: "no .ts files",
      },
    ],
  });
}

// PATTERNS, matched per file. `statusCode\s*=` (an assignment) rather than the
// bare word - `err.statusCode` read off a caught axios/Stripe error is not
// this violation, and nothing in domain/ does that today, but the narrower
// pattern is the one that will not flag it if something ever does.
const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bstatusCode\s*=/, "statusCode"],
  [/\brefuse\s*\(/, "refuse("],
  [/\brefuseWith\s*\(/, "refuseWith("],
  [/#shared\/http\/refuse/, "#shared/http/refuse"],
  // A DECLARATION, not a reference - importing the shared refuse.ts's own
  // HttpError is already caught by the pattern above. This is the local
  // `interface HttpError` / `type HttpError` copy Jacob's finding named.
  [/\b(?:interface|type)\s+\w*HttpError\b/, "HttpError"],
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "tests") continue;
    const full = path.join(dir, e);
    let s;
    try { s = fs.statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    // TESTS ARE EXCLUDED by directory name above and by filename here - the
    // rule is about where a domain file's OWN code lives, and a test asserting
    // a mapped status (`assert.equal(res.status, 404, ...)`) is not the
    // service reaching for one.
    else if (/\.ts$/.test(full) && !/\.d\.ts$/.test(full) && !/\.test\.ts$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

// A MISSING ROOT IS A BROKEN WALK, NOT A CLEAN ONE. `--root-must-exist` is
// only ever passed by the self-test's "missing root" case, which points
// LINT_DOMAIN_ERRORS_ROOT at a directory the harness never created.
const exists = fs.existsSync(ROOT);
const files = exists ? walk(ROOT) : [];

if (!exists || files.length === 0) {
  console.error(
    `lint:domain-errors found no .ts files in ${ROOT} - the walk is broken, ` +
      `not the domain empty.`
  );
  process.exit(1);
}

// FLOOR. 86 non-test files exist under domain/ at the time of writing and the
// number only grows as the restructure continues. A count below this means
// the walk resolved somewhere else, not that domain/ shrank.
const FLOOR = Number(process.env.LINT_DOMAIN_ERRORS_FLOOR ?? 70);
if (files.length < FLOOR) {
  console.error(
    `lint:domain-errors scanned ${files.length} file(s) under ${ROOT}, which is ` +
      `fewer domain files than exist (at least ${FLOOR}). A scan this small means ` +
      `the walk broke, not that domain/ got smaller.`
  );
  process.exit(1);
}

const rel = (f: string) => path.relative(ROOT, f);
const problems: string[] = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const [pattern, label] of PATTERNS) {
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        problems.push(`${rel(file)}:${i + 1}  ${label}\n      ${line.trim()}`);
      }
    });
  }
}

if (problems.length) {
  console.error(
    `domain-errors check failed (${problems.length} finding(s)):\n\n` +
      `  A domain file names the KIND of refusal - Invalid, NotFound, Conflict,\n` +
      `  Forbidden from #shared/errors.ts - and shared/middleware/errorHandler.ts\n` +
      `  maps it to a status. No file under domain/ spells an HTTP status, builds\n` +
      `  an error with statusCode, or calls refuse/refuseWith from\n` +
      `  #shared/http/refuse.ts.\n`
  );
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log(
  `domain-errors check passed (${files.length} file${files.length === 1 ? "" : "s"} scanned, 0 findings)`
);
