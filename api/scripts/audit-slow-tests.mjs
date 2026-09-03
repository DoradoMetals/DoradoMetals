// Every test whose wall clock is an outlier, and nowhere for one to hide.
//
// Jacob's rule: "any test over x threshold above average needs to be targeted
// for fixing." This is that rule, with the arithmetic chosen so it cannot be
// gamed by the very problem it measures.
//
// WHY NOT THE MEAN. The suite's durations are bimodal: ~800 pure functions at
// well under a millisecond, and ~90 that open a transaction against real
// Postgres. On the run that prompted this, twelve tests took 195-468 SECONDS
// each. Those twelve drag the mean up by themselves, so "above average" gets
// LOOSER exactly as the suite gets worse - the metric would improve while the
// problem grew. The median is unmoved by them, and an absolute ceiling is
// unmoved by anything, so this uses both and reports the mean only as context.
//
// THE UNIT IS THE TEST, NOT THE FILE. A file's total is the sum of its tests
// plus its setup; blaming a file cannot tell you which assertion is the one
// waiting. The run that prompted this had "an order that does not exist is
// refused before anything runs" at 195.6 SECONDS - a test that asserts a 404
// and touches nothing. Its own work is microseconds. All 195 seconds are LOCK
// WAIT behind whoever holds the ORDERS advisory lock (shared/testing/locks.ts).
// That is the finding this audit exists to make impossible to miss, and it is
// invisible at file granularity.
//
// SO A FLAG IS NOT AN ACCUSATION. A slow test is usually a slow NEIGHBOUR: the
// fix is almost never in the file that reports. Read the flag as "the suite's
// serial chain is long", walk to the lock holder, and see D94 in FOLLOWUPS.md
// for the standing investigation.
//
// NOT IN `pnpm check`, and the reasoning changed with the runner (see the end
// of this file for the current call). D94 is still outstanding, so a fresh
// run still reports violations; gating on it would just paint the gate red
// for a known thing and train everyone to ignore it - the same reasoning that
// keeps audit:enum-domains and audit:payments out. It exits NON-ZERO by design
// while the violations stand.
//
// *** THE RUNNER MOVED TO VITEST (607f2917) AND THIS STOPPED WORKING AT ALL,
// NOT JUST STOPPED BEING ACCURATE. *** `node --test`'s spec reporter prints
// one line per test - `✔ name (123ms)` - and this parsed that with a regex.
// Vitest's default reporter prints per-FILE summaries, not per-test lines, so
// every run parsed 0 timed tests and hit the REFUSING TO REPORT floor below -
// loudly, not silently, which is the only reason the drift was noticed at all
// (audit:test-leaks' analogous rot was silent - see its own header).
//
// THE FIX IS A SECOND REPORTER, NOT A DIFFERENT PARSER FOR THE FIRST ONE.
// Vitest accepts multiple `--reporter` flags at once, so the suite still
// prints its normal output AND writes a machine-readable one:
// `--reporter=default --reporter=json --outputFile=<path>`. The JSON
// reporter's shape (`testResults[].assertionResults[].duration`, in ms) is
// Jest-compatible and documented in `vitest`'s own `reporters.d.ts` - read
// from there rather than guessed, the same "read the definition" rule
// suite-invocation.ts already applies to how the suite is RUN.
//
// Usage:
//   pnpm --filter @dorado/api audit:slow-tests --from <vitest-json-report.json>
//   pnpm --filter @dorado/api audit:slow-tests            (runs the suite)
//   pnpm --filter @dorado/api audit:slow-tests --self-test
//
// --from reads a saved vitest JSON-reporter output file (`--reporter=json
// --outputFile=...`), so a run already captured for some other reason does
// not have to be re-run; running fresh costs what the suite costs.

import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { suiteInvocation } from "./lib/suite-invocation.ts";

// A test is flagged when it exceeds EITHER bound. Both are absolute statements
// about what this suite should be, not percentages of what it currently is.
//
// CEILING_MS: a test that opens a transaction, writes a few rows and rolls back
// has no business taking ten seconds on a local database holding tens of rows.
// locks.ts documents the order-placing tests at 11-14s and calls that the thing
// to fix, not the thing to accept - so the ceiling sits below them on purpose.
const CEILING_MS = 10_000;
// MEDIAN_MULTIPLE: catches a test that is wildly out of line with its peers
// even if it slips under the ceiling. Computed over DB-CLASS tests only (see
// DB_CLASS_FLOOR_MS) because the median of the whole suite is a fraction of a
// millisecond and would flag everything that touches a socket.
const MEDIAN_MULTIPLE = 20;
const DB_CLASS_FLOOR_MS = 50;

// Legitimately slow tests, each with the reason it earns its wall clock. Pinned
// from BOTH sides like audit:indexes and audit:query-paths: an unaccepted
// violation fails, and an ACCEPTED entry that stops reporting is called out so
// a fixed test cannot leave a stale excuse behind.
//
// EMPTY ON PURPOSE. The obvious move was to seed this with the twelve current
// violators, and that would have been exactly wrong: it would pin the D94
// regression as the accepted baseline, and the audit would then certify the bug
// it was written to find. Nothing goes in here until the suite is healthy and
// someone can say what a specific test's seconds actually BUY.
const ACCEPTED = {
  // "test name": "why this one is genuinely worth its wall clock",
};

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
const thrIdx = args.indexOf("--threshold");
const ceiling = thrIdx >= 0 ? Number(args[thrIdx + 1]) : CEILING_MS;

// Vitest's JSON reporter (`JsonTestResults` in `vitest/dist/chunks/
// reporters.d.*.d.ts`): one entry per FILE in `testResults`, one entry per
// TEST in that file's `assertionResults`, `duration` in milliseconds and
// nullable (a skipped/todo test has none - excluded below, not coerced to 0,
// so it cannot masquerade as a fast pass). `fullName` is the describe-block
// path joined with the title, which is the closest equivalent to node
// --test's single flat name; falls back to joining `ancestorTitles` + `title`
// for a shape that carries one but not the other.
//
// Malformed input (not a run at all, or a JSON error) returns no tests rather
// than throwing, so it falls through to the same "REFUSING TO REPORT: parsed
// 0 timed tests" floor a genuinely empty run hits - one refusal message for
// every way this can have nothing to say, not a stack trace for some of them.
function parse(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const out = [];
  for (const file of data?.testResults ?? []) {
    for (const a of file?.assertionResults ?? []) {
      if (a.duration === null || a.duration === undefined) continue;
      const name = a.fullName || [...(a.ancestorTitles ?? []), a.title].filter(Boolean).join(" > ");
      out.push({ name, ms: Number(a.duration) });
    }
  }
  return out;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(1)}ms`);

// Proves the detector fires, because a threshold audit that parses nothing
// reports a clean suite and looks identical to a healthy one. The first version
// of audit:wire-readiness walked zero files and called every switch ready.
if (selfTest) {
  // A synthetic vitest JSON-reporter report, same shape `--outputFile` writes
  // for real - one file, four assertionResults - not a hand-rolled subset of
  // the fields `parse()` reads, so a field this self-test forgets to fake is
  // a field `parse()` was never proven to read either.
  const fixture = JSON.stringify({
    numTotalTests: 4,
    testResults: [
      {
        name: "fixture.test.ts",
        status: "passed",
        startTime: 0,
        endTime: 0,
        assertionResults: [
          { fullName: "a fast pure function", title: "a fast pure function", ancestorTitles: [], status: "passed", duration: 0.31 },
          { fullName: "a normal db test", title: "a normal db test", ancestorTitles: [], status: "passed", duration: 120.5 },
          { fullName: "another db test", title: "another db test", ancestorTitles: [], status: "passed", duration: 140.0 },
          { fullName: "a pathological waiter", title: "a pathological waiter", ancestorTitles: [], status: "passed", duration: 467600.0 },
        ],
      },
    ],
  });
  const tests = parse(fixture);
  if (tests.length !== 4) {
    console.error(`SELF-TEST FAILED: parsed ${tests.length} of 4 assertionResults`);
    process.exit(1);
  }
  const dbClass = tests.filter((t) => t.ms >= DB_CLASS_FLOOR_MS).map((t) => t.ms);
  const med = median(dbClass);
  const flagged = tests.filter((t) => t.ms > ceiling || t.ms > med * MEDIAN_MULTIPLE);
  if (flagged.length !== 1 || !flagged[0].name.includes("pathological")) {
    console.error(`SELF-TEST FAILED: flagged ${flagged.length}, expected exactly the waiter`);
    process.exit(1);
  }
  // A skipped test (null duration) must not be coerced into a fast pass -
  // proven by planting one and checking it never reaches `tests` at all.
  const withSkip = parse(JSON.stringify({
    testResults: [{ name: "f", assertionResults: [
      { fullName: "skipped one", title: "skipped one", ancestorTitles: [], status: "skipped", duration: null },
    ] }],
  }));
  if (withSkip.length !== 0) {
    console.error(`SELF-TEST FAILED: a null-duration (skipped) test was counted as timed`);
    process.exit(1);
  }
  console.log("self-test ok: parses the vitest JSON reporter, computes the db-class median,");
  console.log(`flags the outlier (${fmt(flagged[0].ms)} against a ${fmt(med)} median),`);
  console.log("and excludes a null-duration (skipped) test rather than counting it as fast.");
  process.exit(0);
}

const SUITE_CWD = new URL("..", import.meta.url).pathname;
// .check-logs/ is check.mjs's own gitignored scratch directory (see its
// header) - reused rather than a fresh os.tmpdir() so a report left behind
// by a crashed run is easy to find, not a surprise loose file in api/.
const REPORT_FILE = path.join(SUITE_CWD, ".check-logs", "audit-slow-tests.json");

let text;
if (from) {
  text = readFileSync(from, "utf8");
} else {
  // READ FROM package.json, NOT RETYPED (D115/D123). The invocation was spelled
  // out here as a string, which is the same defect audit:test-leaks shipped:
  // two hand-copied invocations of one suite, free to drift from it and from
  // each other. A script that runs the suite must run it the way `pnpm test`
  // does, and the only way to guarantee that is to read the definition.
  const invocation = suiteInvocation();
  console.log(
    `running the suite as ${invocation.source} defines it (no --from given), ` +
      `plus a JSON reporter for timings; this costs what the suite costs...`
  );
  // A SECOND REPORTER, APPENDED TO THE REAL INVOCATION - not a replacement for
  // it. `invocation.shellCommand` is the FULL, unparsed `&&` chain (preflight,
  // then the real suite); appending flags to the END of that string appends
  // them as CLI arguments to whichever command is LAST in the chain - the
  // actual `vitest run`, since a `&&` chain only ever reaches its final
  // command on success - so the preflight segment never sees them and never
  // needs to understand them. `--reporter=default` keeps the console output a
  // human watching this run expects; `--reporter=json --outputFile=...` is
  // the second, machine-readable one this audit actually reads. Vitest
  // accepts multiple `--reporter` flags in one invocation for exactly this.
  mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  rmSync(REPORT_FILE, { force: true });
  const command =
    `${invocation.shellCommand} --reporter=default --reporter=json --outputFile="${REPORT_FILE}"`;
  // SHELL, NOT argv - see suite-invocation.ts's header (lane 4, 2026-09-03):
  // the script body is a `&&` chain (preflight, then the real suite) and only
  // a shell runs that the way `pnpm` does. Spawning argv directly here is
  // exactly the parse that made this fall through to the empty-output floor
  // below instead of measuring anything.
  const r = spawnSync(command, {
    cwd: SUITE_CWD,
    env: { ...process.env },
    stdio: ["ignore", "inherit", "inherit"],
    shell: true,
  });
  if (r.status !== 0) console.log("(the suite did not exit 0 - timings below are from that run)");
  // A failing PREFLIGHT segment never reaches vitest at all, so the report
  // file can genuinely not exist - read that as "nothing to parse" (the
  // REFUSING TO REPORT floor below), not an uncaught ENOENT stack trace.
  try {
    text = readFileSync(REPORT_FILE, "utf8");
  } catch {
    text = "";
  }
}

const tests = parse(text);
if (!tests.length) {
  console.error("REFUSING TO REPORT: parsed 0 timed tests.");
  console.error("A source with no parseable durations looks exactly like a fast suite.");
  console.error("Check that the input is a vitest JSON-reporter report (--reporter=json");
  console.error("--outputFile=...) with testResults[].assertionResults[].duration fields.");
  process.exit(1);
}

const all = tests.map((t) => t.ms);
const dbClass = all.filter((ms) => ms >= DB_CLASS_FLOOR_MS);
const med = median(dbClass);
const mean = all.reduce((a, b) => a + b, 0) / all.length;
const relative = med * MEDIAN_MULTIPLE;

const violations = tests
  .filter((t) => t.ms > ceiling || (med > 0 && t.ms > relative))
  .sort((a, b) => b.ms - a.ms);

const unaccepted = violations.filter((v) => !ACCEPTED[v.name]);
const accepted = violations.filter((v) => ACCEPTED[v.name]);

console.log(`${tests.length} timed tests; ${dbClass.length} db-class (>= ${DB_CLASS_FLOOR_MS}ms)`);
console.log(`total ${fmt(all.reduce((a, b) => a + b, 0))}  mean ${fmt(mean)}  db-class median ${fmt(med)}`);
console.log(`thresholds: absolute ${fmt(ceiling)}, relative ${MEDIAN_MULTIPLE}x median = ${fmt(relative)}\n`);

if (accepted.length) {
  console.log(`${accepted.length} accepted:`);
  for (const a of accepted) console.log(`  ok ${fmt(a.ms).padStart(8)}  ${a.name}\n         ${ACCEPTED[a.name]}`);
  console.log("");
}

const stale = Object.keys(ACCEPTED).filter((k) => !violations.some((v) => v.name === k));
if (stale.length) {
  console.log(`${stale.length} ACCEPTED entr(ies) no longer report - remove them:`);
  for (const s of stale) console.log(`  - ${s}`);
  console.log("");
}

if (!unaccepted.length) {
  console.log("no unaccepted outliers.");
  process.exit(stale.length ? 1 : 0);
}

console.log(`${unaccepted.length} test(s) over threshold:\n`);
for (const v of unaccepted) console.log(`  ${fmt(v.ms).padStart(8)}  ${v.name}`);
console.log(`\n  Together they are ${fmt(unaccepted.reduce((a, b) => a + b.ms, 0))} of the suite.`);
console.log("\n  A slow test is usually a slow NEIGHBOUR - most of these seconds are");
console.log("  lock wait, not work. Start at shared/testing/locks.ts and D94, not here.");
process.exit(1);
