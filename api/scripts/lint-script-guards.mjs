// THE GUARD ON THE GUARDS.
//
// FIVE gate scripts were found broken in three waves, and they are one class:
//
//   D110  validate:wire called a function a factoring pass had moved. The
//         specifier still RESOLVED, so lint:imports saw nothing; it failed only
//         when the line ran.
//   D115  audit:test-leaks spawned the suite WITHOUT NODE_ENV=test, so
//         isTestRun() - what keeps tests off the live mail, FedEx and Stripe
//         clients - ran with one of its two legs dead. It HAD a --self-test and
//         rotted anyway, because the failure was ENVIRONMENTAL.
//   D118  `diff` had not parsed for TEN COMMITS. A commit deleted a retired
//         feature's entry and took the closing brace and the whole comparison
//         engine with it. Every run died on SyntaxError before opening a
//         connection.
//   D120  route-guards - the AUTHORIZATION census - silently dropped six routes
//         and EXITED 0, including DELETE purge_cancelled and both create_review
//         paths. Three hardcoded assumptions, each true of the shape the code
//         happened to have.
//   +1    audit:frontend-nullability's --self-test had been failing since the
//         contracts conversion deleted the one schema it was pinned to. Found
//         by this file's first run. Nothing else runs it.
//
// WHAT THEY HAVE IN COMMON: tooling under scripts/ is typechecked by nothing,
// imported by nothing and covered by no test, so it rots silently while
// everything it audits stays green. Two of the five were invisible because they
// are not gate members; two were invisible DESPITE being run, because they
// exited 0 on a subset.
//
// D135 IS THE SHARP VERSION, and it is what this file enforces: an ASSERTION
// that cannot see its subject FAILS; a REPORT that cannot see its subject
// PRINTS A SMALLER NUMBER AND EXITS 0. All five rotted scripts are reports. So:
//
//   1. EVERY script must PARSE. This is D118, and nothing else can catch it -
//      the casualty there was the runner, not a caller, so there was no import
//      to lint and no error to read.
//   2. EVERY script must be executable-verified or explicitly EXCUSED. A
//      --self-test is not accepted on the strength of the flag appearing in the
//      source: this RUNS it, requires exit 0, and requires the run to say so.
//      A script that ignores an unknown flag and exits 0 would otherwise look
//      self-tested from the outside, which is the same optimism that let a
//      census pass on a subset.
//   3. The EXCUSED list is pinned FROM BOTH SIDES. An unlisted script with no
//      self-test fails; a listed script that GAINS one also fails, so the list
//      can only shrink. An exclusion that outlives its subject silently
//      excuses the next one.
//   4. A SCRIPT EXCUSED AS A **REPORT** MUST CARRY A FLOOR. This is the half of
//      D5 that was outstanding: the rule was meant to be "neither a self-test
//      nor a floor", and only the self-test half was enforced. D135's practical
//      rule is PREFER AN ASSERTION TO A REPORT, and where a script must report,
//      GIVE IT A FLOOR - a report with a floor is an assertion about its own
//      coverage. So every excuse now declares a `kind`, and a `report` must name
//      a floor constant in its source. It found a real one immediately:
//      `audit-coverage.mjs` was excused with "a floor guards the walk" and HAD
//      NO FLOOR. The word appears once in that file, in its header, meaning
//      something else entirely.
//   5. THE ENVIRONMENTAL RULE (D123). A --self-test proves the DETECTOR works
//      and says nothing about the ENVIRONMENT THE SUBJECT RUNS IN. Any script
//      that runs the test suite must read the invocation from package.json
//      rather than assembling one.
//
//   pnpm --filter @dorado/api lint:script-guards
//   pnpm --filter @dorado/api lint:script-guards --self-test
//   pnpm --filter @dorado/api lint:script-guards --list

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";

const REPO = process.env.SCRIPT_GUARDS_ROOT
  ? path.resolve(process.env.SCRIPT_GUARDS_ROOT)
  : path.resolve(import.meta.dirname, "..", "..");

const DIRS = [
  path.join(REPO, "api", "scripts"),
  path.join(REPO, "api", "scripts", "lib"),
  path.join(REPO, "frontend", "scripts"),
];

// ---------------------------------------------------------------------------
// EXCUSED: scripts with no --self-test, and why. PINNED BOTH WAYS.
//
// The bar for an entry is not "writing one would be work". It is that the
// script has no DETECTOR to test - it performs an action, or dumps a file, or
// its entire output is the database's answer to a question. Where a script
// counts anything, it needs a floor and a self-test, and the entry says so.
// ---------------------------------------------------------------------------
// A `kind` on every entry:
//   "action"    - it DOES something (migrates, dumps, restores). Nothing to count.
//   "assertion" - it fails on its own subject; a broken run does not exit 0.
//   "library"   - imported by other scripts; covered by their runs and its own tests.
//   "report"    - it COUNTS something and prints the count. MUST CARRY A FLOOR.
const REAL_EXCUSED = {
  // --- actions, not detectors. There is nothing to plant a violation in. ---
  "api/scripts/migrate.mjs": {
    kind: "action",
    why:"applies migrations. An action, and one that must never be exercised " +
    "speculatively - its self-test would be a migration run.",
  },
  "api/scripts/backup.mjs": {
    kind: "action",
    why:"shells out to pg_dump. What it produces is a file; what would be tested is " +
    "pg_dump.",
  },
  "api/scripts/preflight-test-db.ts": {
    kind: "assertion",
    why:"asserts a precondition and does nothing else - that the test database " +
    "is reachable, is the LOCAL one rather than the production-shaped remote " +
    "`test`, has an exchange schema, and has users. There is no detector to " +
    "attack: every branch is a refusal, and the thing it inspects is a live " +
    "database rather than a tree that could be synthesised.",
  },
  "api/scripts/provision-test-db.ts": {
    kind: "action",
    why:"rebuilds the `test` database from DEV. Every path that does anything " +
    "WRITES - it drops every schema in the target - so there is no safe " +
    "self-test, and the harness's required `pass` case could only be a dry run " +
    "against two reachable databases, which is environment-dependent. Its " +
    "guards are refusals that fire before anything happens: an allowlist of " +
    "target NAMES (test, and nothing else), a system_identifier comparison that " +
    "survives a renamed URL, and dry-by-default with --commit the only way to " +
    "write. All four were exercised by hand and each exits 1.",
  },
  "api/scripts/refresh-from-backup.mjs": {
    kind: "action",
    why:"restores a database from an archive. Every path it has WRITES, so there is " +
    "no safe self-test; its guards are refusals (allowlisted target names, a " +
    "pg_restore --list check) which fire before anything happens.",
  },
  "api/scripts/seed-e2e-users.mjs": {
    kind: "action",
    why:"creates the e2e fixtures. An action against the test database.",
  },
  "api/scripts/generate-feature.mjs": {
    kind: "action",
    why:"scaffolds files. It already refuses to overwrite anything that exists, " +
    "which is the only assertion it can make about a codebase it is adding to.",
  },
  "api/scripts/clean-dual-run-orphans.mjs": {
    kind: "action",
    why:"deletes orphaned dual-run rows. An action, and a destructive one - it is " +
    "interactive and refuses on any reference it finds.",
  },
  "api/scripts/clean-leaked-test-orders.mjs": {
    kind: "action",
    why:"deletes the 27 leaked test orders from dev. An action, already run once " +
    "(cdf267e0), and destructive. Its guards are refusals rather than a " +
    "detector: dry by default with --commit to apply, deletes by NAMED IDS " +
    "only so it cannot widen to a predicate, refuses if any target is not a " +
    "Pending purchase, and refuses if any survive. A self-test would have to " +
    "plant orders to delete them, which is the write this script must never " +
    "make speculatively.",
  },

  // --- dumps: the output IS the subject, and it is inspected by a human. ---
  "api/scripts/dump-schema.mjs": {
    kind: "action",
    why:"prints DDL. The output is the artifact.",
  },
  "api/scripts/dump-seed.mjs": {
    kind: "action",
    why:"prints seed SQL. The output is the artifact.",
  },
  "api/scripts/dump-stripe-reconciliation.mjs": {
    kind: "action",
    why:"one-shot export reader for the payments migration. Carries a column floor " +
    "on the Stripe export it parses.",
  },
  "api/scripts/plan-migration.mjs": {
    kind: "action",
    why:"prints a plan for a human to read. It asserts nothing and is not consulted " +
    "by anything automated.",
  },

  // --- pure database questions: the answer is the database's, not a parser's ---
  "api/scripts/audit-nullability.mjs": {
    kind: "assertion",
    why:"asks production which columns are 100% NULL. There is no parser to break - " +
    "it refuses when the catalogue holds a table it cannot read, which is the " +
    "only way it can be wrong.",
  },
  "api/scripts/audit-payments.mjs": {
    kind: "assertion",
    why:"lists the Stripe intents production has no record of. Exits non-zero by " +
    "design while that is outstanding.",
  },
  "api/scripts/audit-item-price.mjs": {
    kind: "action",
    why:"one-shot answer to ruling 34 (D116), kept for the record.",
  },
  "api/scripts/audit-guards.mjs": {
    kind: "assertion",
    why:"asks each backfill guard whether it would refuse against production. The " +
    "guards are the subject and they have their own tests.",
  },
  "api/scripts/compare-tables.mjs": {
    kind: "action",
    why:"prints two tables side by side for a human. compare-databases is the " +
    "asserting version.",
  },
  "api/scripts/verify-genesis-production.mjs": {
    kind: "assertion",
    why:"builds genesis against a read-only production connection. Cannot be run " +
    "speculatively.",
  },
  "api/scripts/verify-orders-decomposition.mjs": {
    kind: "assertion",
    why:"compares the composed order against its parts, in the database. Its subject " +
    "is rows, and it fails on any mismatch.",
  },
  "api/scripts/verify-sales-order-decomposition.mjs": {
    kind: "assertion",
    why:"the sales-order half of the same comparison.",
  },

  // --- the libraries, exercised through every script that imports them ---
  "api/scripts/lib/self-test-harness.ts": {
    kind: "library",
    why:"IS the self-test harness. Every --self-test this file executes is a run of " +
    "it, and it refuses a suite with no `pass` case as well as no `fail` case.",
  },
  "api/scripts/lib/suite-invocation.ts": {
    kind: "library",
    why:"read by audit-test-leaks and audit-slow-tests; its three refusals are " +
    "attacked directly (no test script, a non-node runner, a missing NODE_ENV).",
  },
  "api/scripts/lib/baseline.ts": {
    kind: "library",
    why:"has scripts/lib/tests/baseline.test.ts.",
  },
  "api/scripts/lib/feature-map.ts": {
    kind: "library",
    why:"has scripts/lib/tests/feature-map.test.ts.",
  },

  // --- floors, but no detector to attack ---
  "api/scripts/audit-constraints.mjs": {
    kind: "report",
    why:"compares constraints between schemas; carries a floor, and the floor firing " +
    "is what proved it (see its own header). It is a report only in shape now - it " +
    "carries four ACCEPTED maps pinned from both sides and EXITS NON-ZERO on an " +
    "unaccepted finding or a stale accept, and it is a member of pnpm check.",
  },
  "api/scripts/audit-coverage.mjs": {
    kind: "report",
    why:"every populated exchange column with nowhere to go. The subject is the " +
    "database catalogue; a floor guards the walk.",
  },
  "api/scripts/audit-indexes.mjs": {
    kind: "report",
    why:"reads pg_index on both sides. audit:query-paths is the code-walking half " +
    "and that one has both a floor and a control.",
  },
  "api/scripts/audit-precision.mjs": {
    kind: "report",
    why:"casts source values into target types in the database. No parser.",
  },
  "api/scripts/audit-enum-domains.mjs": {
    kind: "report",
    why:"compares text values against enum labels in the database. Exits non-zero by " +
    "design while D39 is outstanding.",
  },
  "api/scripts/compare-databases.mjs": {
    kind: "report",
    why:"refuses when it compared no tables, and when both URLs resolve to the same " +
    "database - a comparison of something with itself always passes.",
  },
  "api/scripts/verify-parity.mjs": {
    kind: "report",
    why:"source table against target, type-aware, in the database.",
  },
  "api/scripts/verify-genesis.mjs": {
    kind: "assertion",
    why:"builds the whole schema into renamed schemas inside a rolled-back " +
    "transaction. The build either succeeds or it does not.",
  },
  "api/scripts/verify-backfill.mjs": {
    kind: "assertion",
    why:"runs every backfill into empty tables, re-runs for idempotency, then checks " +
    "the guard refuses. It is already three assertions deep.",
  },
  "api/scripts/validate-wire.ts": {
    kind: "report",
    why:"parses real responses through the contracts. It now carries a REGISTRATION " +
    "floor and a PARSE floor - the quiet failure is a case that skips, and a " +
    "skip is now printed and counted rather than folded into the match count.",
  },
};

// Scripts whose --self-test is real but must not be run from here, with the
// reason. PINNED: an entry that no longer names a real script fails.
const REAL_NOT_EXECUTED_HERE = {
  "api/scripts/audit-test-leaks.ts":
    "its --self-test writes a row inside a transaction it rolls back, and " +
    "fingerprints every exchange table first. Correct, but this file must not " +
    "issue a write on a gate run. Run `pnpm --filter @dorado/api " +
    "audit:test-leaks:self-test` deliberately.",
  "api/scripts/audit-slow-tests.mjs":
    "parses a saved suite run; harmless, but it belongs to the suite lane and is " +
    "run by `audit:slow-tests:self-test`.",
};

// Under a synthetic root the real pin lists name nothing that exists, so both
// are overridable in the same breath as the root - which is also what lets the
// PINNING itself be attacked from both directions below.
// Overridden only when EXPLICITLY given, not merely because the root moved.
// The first version keyed off SCRIPT_GUARDS_ROOT alone, which broke the most
// useful attack there is: point this at a COPY of the real repo, break one file
// in it, and see whether the census notices. With the lists emptied, that run
// reported 44 problems and none of them was the planted one.
const EXCUSED = process.env.SCRIPT_GUARDS_EXCUSED
  ? JSON.parse(process.env.SCRIPT_GUARDS_EXCUSED)
  : REAL_EXCUSED;
const NOT_EXECUTED_HERE = process.env.SCRIPT_GUARDS_DEFERRED
  ? JSON.parse(process.env.SCRIPT_GUARDS_DEFERRED)
  : REAL_NOT_EXECUTED_HERE;

// ---------------------------------------------------------------------------

// WHAT COUNTS AS A SCRIPT. This filtered `.mjs` alone, which is D120's
// hardcoded `routes.ts` wearing a different hat: the moment a script became
// TypeScript it left the census - no parse check, no self-test run, no EXCUSED
// pin - and the only thing that would have noticed is SCRIPT_FLOOR, five
// conversions later. D157's fix converts these files, so the census has to
// follow them. `.d.ts` is a declaration, and `*.test.ts` belongs to the suite.
const TS = /\.(m|c)?ts$/;
const isScript = (name) =>
  (name.endsWith(".mjs") || TS.test(name)) &&
  !name.endsWith(".d.ts") &&
  !/\.test\.(m|c)?[tj]s$/.test(name);

const listScripts = () => {
  const out = [];
  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!isScript(name)) continue;
      out.push(path.join(dir, name));
    }
  }
  return out.sort();
};

const rel = (f) => path.relative(REPO, f).replace(/\\/g, "/");

const scripts = listScripts();

// A FLOOR ON THE CENSUS ITSELF. This file is a report about reports; if its own
// walk breaks it would find nothing to complain about and exit 0, which is the
// exact failure it exists to prevent.
const SCRIPT_FLOOR = Number(process.env.SCRIPT_GUARDS_FLOOR ?? 50);
if (scripts.length < SCRIPT_FLOOR) {
  console.error(
    `lint:script-guards found ${scripts.length} script(s) across ${DIRS.length} ` +
      `directories, expected at least ${SCRIPT_FLOOR}. The walk is broken, not the ` +
      `tooling gone. A guard census that cannot see its subject must fail, not shrug.`
  );
  process.exit(1);
}

if (process.argv.includes("--list")) {
  for (const f of scripts) {
    const src = fs.readFileSync(f, "utf8");
    const has = /process\.argv[^\n]*--self-test|args\.(?:includes|has)\("--self-test"\)/.test(src);
    const ex = EXCUSED[rel(f)];
    const tag = has ? "self-test" : ex ? `excused:${ex.kind}`.padEnd(9) : "NOTHING  ";
    console.log(`${tag}  ${rel(f)}${!has && ex ? (hasFloor(src) ? "  [floor]" : "") : ""}`);
  }
  process.exit(0);
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const Q = String.fromCharCode(34);
  // A script that verifies itself, in the fixture's terms: recognises the flag,
  // announces the run, exits 0.
  const good = (name) =>
    `if (process.argv.includes(${Q}--self-test${Q})) {\n` +
    `  console.log(${Q}self-test ok: ${name}${Q});\n  process.exit(0);\n}\n` +
    `console.log(${Q}${name} ran${Q});\n`;
  // `delta.ts` is here so EVERY case below walks a TypeScript script. Without
  // one in the clean tree, "a clean set passes" would pass just as happily with
  // the .ts leg of the walk deleted.
  const base = (over = {}) => ({
    "api/scripts/alpha.mjs": good("alpha"),
    "api/scripts/beta.mjs": good("beta"),
    "api/scripts/delta.ts": `const n: number = 1;\n` + good("delta"),
    "frontend/scripts/gamma.mjs": good("gamma"),
    ...over,
  });
  const FLOOR = {
    SCRIPT_GUARDS_FLOOR: "3",
    SCRIPT_GUARDS_SUITE_FLOOR: "0",
    // Explicit, because the real lists name nothing in a synthetic tree - and
    // because the override must NOT be implied by the root alone (see above).
    SCRIPT_GUARDS_EXCUSED: "{}",
    SCRIPT_GUARDS_DEFERRED: "{}",
  };
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a clean set of self-verifying scripts passes",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base(), expect: "pass", mustPrint: "either self-tested here or excused by name",
      },
      {
        name: "a script that does not PARSE is caught (D118 - `diff` for ten commits)",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base({ "api/scripts/broken.mjs": "const FEATURES = {\n  payments: { reads: [] },\n" }),
        expect: "fail", mustPrint: "PARSE",
      },
      {
        // THE ATTACK THAT FOUND THE HOLE. `node --check` exits 0 on this file,
        // so before the type stripper went in, this case PASSED - the census
        // reported every script parsing while one of them could not.
        name: "a TypeScript script that does not PARSE is caught (node --check cannot see it)",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base({ "api/scripts/broken.ts": "export const F: Record<string, string> = {\n  a: \"b\",\n" }),
        expect: "fail", mustPrint: "PARSE",
      },
      {
        // `.mts` IS THE FRONTEND'S SPELLING, because frontend/package.json has
        // no `"type": "module"`. `".mts".endsWith(".ts")` is false, so a check
        // written for `.ts` alone routes these straight back to `node --check`,
        // which sees nothing. Pinned separately for that reason.
        name: "a broken .mts is caught too (frontend/ cannot use plain .ts)",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base({ "frontend/scripts/broken.mts": "const y: = 2;\n" }),
        expect: "fail", mustPrint: "PARSE",
      },
      {
        name: "a script with neither a self-test nor an excuse is caught",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base({ "api/scripts/naked.mjs": "console.log('I audit things');\n" }),
        expect: "fail", mustPrint: "NO-GUARD",
      },
      {
        // THE HALF OF D5 THAT WAS OUTSTANDING. A script excused as a report is
        // claiming it counts something; a count with no floor prints a smaller
        // number and exits 0, which is the only failure mode of a report.
        name: "a report excused with no floor is caught (D5's floor half)",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: {
          ...FLOOR,
          SCRIPT_GUARDS_EXCUSED: JSON.stringify({
            "api/scripts/counter.mjs": { kind: "report", why: "counts things" },
          }),
        },
        files: base({ "api/scripts/counter.mjs": "console.log('counted 3 things');\n" }),
        expect: "fail", mustPrint: "NO-FLOOR",
      },
      {
        name: "the same script WITH a floor is accepted",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: {
          ...FLOOR,
          SCRIPT_GUARDS_EXCUSED: JSON.stringify({
            "api/scripts/counter.mjs": { kind: "report", why: "counts things, and has a floor" },
          }),
        },
        files: base({
          "api/scripts/counter.mjs":
            "const THING_FLOOR = 2;\nconst n = 3;\nif (n < THING_FLOOR) process.exit(1);\n",
        }),
        expect: "pass", mustPrint: "either self-tested here or excused by name",
      },
      {
        // A FLOOR IS NOT A COMMENT ABOUT ONE. The file's own history: the
        // environmental rule was satisfied by prose mentioning the library.
        name: "a comment saying FLOOR does not count as having one",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: {
          ...FLOOR,
          SCRIPT_GUARDS_EXCUSED: JSON.stringify({
            "api/scripts/counter.mjs": { kind: "report", why: "counts things" },
          }),
        },
        files: base({
          "api/scripts/counter.mjs": "// THE FLOOR is discussed at length here.\nconsole.log('counted 3');\n",
        }),
        expect: "fail", mustPrint: "NO-FLOOR",
      },
      {
        name: "an excuse claiming nothing to count, on a script with a floor, is caught",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: {
          ...FLOOR,
          SCRIPT_GUARDS_EXCUSED: JSON.stringify({
            "api/scripts/counter.mjs": { kind: "action", why: "does a thing" },
          }),
        },
        files: base({
          "api/scripts/counter.mjs":
            "const THING_FLOOR = 2;\nconst n = 3;\nif (n < THING_FLOOR) process.exit(1);\n",
        }),
        expect: "fail", mustPrint: "MISCLASSIFIED",
      },
      {
        name: "an excuse that outlives its subject is caught - the pin works both ways",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: { ...FLOOR, SCRIPT_GUARDS_EXCUSED: JSON.stringify({ "api/scripts/alpha.mjs": { kind: "action", why: "no detector" } }) },
        files: base(), expect: "fail", mustPrint: "STALE-EXCUSE",
      },
      {
        name: "a self-test that FAILS is caught - having one is not evidence it passes",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base({ "api/scripts/liar.mjs":
          `if (process.argv.includes(${Q}--self-test${Q})) {\n  console.error(${Q}self-test FAILED${Q});\n  process.exit(1);\n}\n` }),
        expect: "fail", mustPrint: "SELF-TEST",
      },
      {
        name: "a script that IGNORES --self-test and exits 0 does not count as verified",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        // It mentions the flag (so the census sees one) but never says it ran.
        files: base({ "api/scripts/shrug.mjs":
          `const f = process.argv.includes(${Q}--self-test${Q});\nconsole.log(${Q}audited 3 things${Q});\n` }),
        expect: "fail", mustPrint: "without saying it ran one",
      },
      {
        name: "a hand-assembled `node --test` is caught (D115, the environmental rule)",
        rootEnv: "SCRIPT_GUARDS_ROOT", env: FLOOR,
        files: base({ "api/scripts/leaks.mjs":
          `import { spawn } from ${Q}node:child_process${Q};\n` +
          `if (process.argv.includes(${Q}--self-test${Q})) { console.log(${Q}self-test ok${Q}); process.exit(0); }\n` +
          `spawn(${Q}node${Q}, [${Q}--test${Q}], { env: { TZ: ${Q}UTC${Q} } });\n` }),
        expect: "fail", mustPrint: "hand-assembled invocation",
      },
      {
        name: "the suite-library control fires when nothing reads the invocation any more",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: { ...FLOOR, SCRIPT_GUARDS_SUITE_FLOOR: "2" },
        files: base(), expect: "fail", mustPrint: "has gone back to assembling its own",
      },
      {
        name: "the census floor fires when the walk finds fewer scripts than exist",
        rootEnv: "SCRIPT_GUARDS_ROOT",
        env: { ...FLOOR, SCRIPT_GUARDS_FLOOR: "999" },
        files: base(), expect: "fail", mustPrint: "A guard census that cannot see its subject",
      },
    ],
  });
}

const problems = [];
const note = (kind, file, detail) => problems.push({ kind, file: rel(file), detail });

// --- 1. EVERYTHING PARSES (D118) -------------------------------------------
//
// `node --check` DOES NOT PARSE TYPESCRIPT. It exits 0 on a .ts file whatever
// is in it - including an object literal missing its closing brace, which is
// D118 exactly. So the arrival of the first .ts script would have silently
// retired this assertion while the census went on reporting the same count.
// TypeScript goes through the type stripper instead, which throws on a syntax
// error; a self-test case below plants one so this leg is pinned by attack.
const parseFailure = (f) => {
  // `.mts` AS WELL AS `.ts`, and the distinction is not cosmetic: frontend/ has
  // no `"type": "module"`, so a TypeScript script there must be `.mts` to be
  // read as ESM without a reparse warning - and `".mts".endsWith(".ts")` is
  // FALSE, which would have quietly routed exactly those files back to the
  // blind `node --check`.
  if (TS.test(f)) {
    try {
      stripTypeScriptTypes(fs.readFileSync(f, "utf8"), { mode: "strip" });
      return null;
    } catch (err) {
      return String(err?.message ?? err).split("\n").slice(0, 3).join(" ").trim();
    }
  }
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  return r.status === 0 ? null : (r.stderr || "").split("\n").slice(0, 3).join(" ").trim();
};

let parsed = 0;
for (const f of scripts) {
  const why = parseFailure(f);
  if (why) note("PARSE", f, why);
  else parsed += 1;
}

// --- 2. THE ENVIRONMENTAL RULE (D115/D123) ---------------------------------
//
// A script that spawns the node test runner must not spell the invocation out.
// The literal is matched as a quoted argument so that this file's own
// `--self-test` handling, and any prose mentioning --test, do not trip it.
let viaLibrary = 0;
for (const f of scripts) {
  const src = fs.readFileSync(f, "utf8");
  // THE IMPORT, NOT A MENTION. This matched the bare path, and every file that
  // merely NAMES scripts/lib/suite-invocation.mjs in a comment counted as
  // compliant - including audit-test-leaks, whose header explains why it uses
  // the library. So the attack that put a hand-assembled `node --test` back
  // into that exact file PASSED, because the prose above it still mentioned the
  // library. A guard satisfied by a comment about itself is not a guard.
  const usesLibrary = /\bfrom\s*["'][^"']*lib\/suite-invocation\.(mjs|ts)["']/.test(src);
  if (usesLibrary) viaLibrary += 1;
  // A hand-assembled `node --test`. The literal is matched as a QUOTED argument
  // so that prose about --test, and this file's own --self-test handling, do not
  // trip it.
  const handRolled = /["']--test["']/.test(src) && /node:child_process/.test(src);
  if (handRolled && !usesLibrary) {
    note(
      "ENV",
      f,
      "spawns the node test runner with a hand-assembled invocation. " +
        "audit:test-leaks did exactly this and ran the suite with NODE_ENV unset, " +
        "leaving isTestRun() on one of its two legs, so the guard that keeps tests " +
        "off the live mail, FedEx and Stripe clients ran on half its legs (D115). " +
        "Import scripts/lib/suite-invocation.ts and read the invocation from " +
        "package.json instead."
    );
  }
}

// A KNOWN-PRESENT CONTROL FOR THE ENVIRONMENTAL RULE. The check above can only
// fire on a script that spells `--test` out; a script that STOPS going through
// the library - by inlining the spawn some other way, or by being deleted and
// replaced - makes it silent. Two scripts run the suite today and both read the
// invocation from package.json. If that count falls, this rule has lost its
// subject rather than found compliance.
const SUITE_LIBRARY_FLOOR = Number(process.env.SCRIPT_GUARDS_SUITE_FLOOR ?? 2);
if (viaLibrary < SUITE_LIBRARY_FLOOR) {
  note(
    "ENV",
    path.join(REPO, "api/scripts/lib/suite-invocation.ts"),
    `only ${viaLibrary} script(s) read the suite invocation from package.json, ` +
      `expected at least ${SUITE_LIBRARY_FLOOR}. Either a script that runs the suite ` +
      `has gone back to assembling its own (D115), or the library has lost its callers.`
  );
}

// A FLOOR, RECOGNISED BY BEING NAMED. Any constant whose name contains FLOOR,
// used in a comparison. Requiring the NAME rather than trying to recognise the
// shape is deliberate: `checked < 50` is a perfectly good floor and this could
// not tell it from any other comparison against a literal, so the convention is
// that a floor is spelled out. `audit-constraints.mjs` had exactly that literal
// and was renamed to `CONSTRAINT_FLOOR` when this went in.
//
// ITS BLIND SPOT, stated (D6): it cannot tell a floor that FIRES from a constant
// that is declared and never compared. What it can tell you is that a file
// excused with the words "carries a floor" has one, which is more than anything
// checked before - and each floor is separately proved by attack, by running the
// script with its own `*_FLOOR` env override set absurdly high.
const hasFloor = (src) => /\b[A-Z][A-Z0-9_]*FLOOR[A-Z0-9_]*\b/.test(src);

// --- 3. EVERY SCRIPT IS VERIFIED OR EXCUSED, PINNED BOTH WAYS --------------
const hasSelfTest = new Map();
for (const f of scripts) {
  const src = fs.readFileSync(f, "utf8");
  hasSelfTest.set(rel(f), /(?:includes|has)\(\s*["']--self-test["']\s*\)/.test(src));
}

for (const f of scripts) {
  const key = rel(f);
  const has = hasSelfTest.get(key);
  const excused = EXCUSED[key];
  if (has && excused) {
    note(
      "STALE-EXCUSE",
      f,
      "is excused from having a --self-test AND has one. Delete its entry from " +
        "EXCUSED in scripts/lint-script-guards.mjs - an exclusion that outlives its " +
        "subject silently excuses the next one."
    );
  }
  // THE FLOOR HALF OF THE RULE. A script excused as a REPORT counts something
  // and prints the count, which is the one shape that fails silently: it prints
  // a smaller number and exits 0. It must carry a floor. An excuse of any other
  // kind is asserting there is nothing to count.
  if (!has && excused && excused.kind === "report" && !hasFloor(fs.readFileSync(f, "utf8"))) {
    note(
      "NO-FLOOR",
      f,
      "is excused as a REPORT and names no floor. D135: an assertion that cannot " +
        "see its subject FAILS; a report that cannot see its subject PRINTS A SMALLER " +
        "NUMBER AND EXITS 0. Give it a constant whose name contains FLOOR, compared " +
        "against what it actually walked, or change its kind if it counts nothing."
    );
  }
  // AND THE OTHER DIRECTION, so the classification can only get more honest: a
  // script excused as having nothing to count, which has grown a floor, is
  // counting something and its entry is out of date.
  if (!has && excused && excused.kind !== "report" && hasFloor(fs.readFileSync(f, "utf8"))) {
    note(
      "MISCLASSIFIED",
      f,
      `is excused as "${excused.kind}" - nothing to count - and names a floor. ` +
        "Either the floor is vestigial or the script became a report. Change the " +
        "kind to \"report\" in EXCUSED, which subjects it to the floor rule above."
    );
  }
  if (!has && !excused) {
    note(
      "NO-GUARD",
      f,
      "has no --self-test and no entry in EXCUSED. Give it one (see " +
        "scripts/lib/self-test-harness.ts - it spawns the whole script against a synthetic " +
        "tree, so the WALK is in the blast radius, which is where three of the five " +
        "rots lived), or excuse it with a reason that says why there is no detector " +
        "to attack."
    );
  }
}

for (const key of Object.keys(EXCUSED)) {
  if (!hasSelfTest.has(key)) note("STALE-EXCUSE", path.join(REPO, key), "is excused but does not exist");
}
for (const key of Object.keys(NOT_EXECUTED_HERE)) {
  if (!hasSelfTest.has(key)) {
    note("STALE-SKIP", path.join(REPO, key), "is listed in NOT_EXECUTED_HERE but does not exist");
  } else if (!hasSelfTest.get(key)) {
    note("STALE-SKIP", path.join(REPO, key), "is listed in NOT_EXECUTED_HERE but has no --self-test");
  }
}

// --- 4. RUN THE SELF-TESTS. Having one is not evidence that it passes. -----
//
// A run must EXIT 0 **and** SAY SO. A script that ignores an unrecognised flag
// exits 0 having done its ordinary work, and would otherwise be indistinguishable
// from one that verified itself - which is precisely the optimism that let a
// census report success on a subset of routes.
const MARKER = /self[- ]test/i;
let ran = 0;
const skipped = [];
for (const f of scripts) {
  const key = rel(f);
  if (!hasSelfTest.get(key)) continue;
  // THIS FILE IS NOT EXEMPT FROM ITS OWN RULE. It runs its own --self-test like
  // every other script's. The recursion terminates because a --self-test case
  // points a child at a synthetic tree that contains no copy of this file.
  if (NOT_EXECUTED_HERE[key]) { skipped.push(key); continue; }
  const r = spawnSync(process.execPath, [f, "--self-test"], {
    cwd: path.dirname(f),
    encoding: "utf8",
    timeout: 180_000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  ran += 1;
  if (r.status !== 0) {
    note("SELF-TEST", f, `--self-test exited ${r.status}\n${out.split("\n").slice(-14).join("\n")}`);
  } else if (!MARKER.test(out)) {
    note(
      "SELF-TEST",
      f,
      "--self-test exited 0 without saying it ran one. A script that ignores an " +
        "unknown flag exits 0 too; the run must announce itself."
    );
  }
}

// ---------------------------------------------------------------------------
const byKind = {};
for (const e of Object.values(EXCUSED)) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
const kinds = Object.entries(byKind).sort().map(([k, n]) => `${n} ${k}`).join(", ");
console.log(
  `${scripts.length} script(s) under scripts/: ${parsed} parse, ${ran} --self-test(s) run, ` +
    `${skipped.length} deferred, ${Object.keys(EXCUSED).length} excused (${kinds}), ` +
    `${viaLibrary} reading the suite invocation from package.json`
);
for (const k of skipped) console.log(`  deferred  ${k}\n            ${NOT_EXECUTED_HERE[k]}`);

if (!problems.length) {
  console.log(
    "\nevery script parses, every one is either self-tested here or excused by name, " +
      "and every script excused as a REPORT carries a floor"
  );
  process.exit(0);
}

console.error(`\n${problems.length} problem(s):\n`);
for (const p of problems) {
  console.error(`  ${p.kind.padEnd(12)} ${p.file}`);
  for (const line of p.detail.split("\n")) console.error(`               ${line}`);
  console.error("");
}
process.exit(1);
