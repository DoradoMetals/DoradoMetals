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
// NOT IN `pnpm check` YET, and deliberately. D94 is outstanding, so every run
// today reports a dozen violations; gating on it would just paint the gate red
// for a known thing and train everyone to ignore it - the same reasoning that
// keeps audit:enum-domains and audit:payments out. It exits NON-ZERO by design
// while the violations stand. When D94 is fixed and the list is empty or
// entirely ACCEPTED, add it to the chain and it will hold the line.
//
// Usage:
//   pnpm --filter @dorado/api audit:slow-tests --from <captured-run.txt>
//   pnpm --filter @dorado/api audit:slow-tests            (runs the suite)
//   pnpm --filter @dorado/api audit:slow-tests --self-test
//
// --from parses a saved `node --test` spec-reporter run, which is what the gate
// already produces; running the suite fresh costs what the suite costs.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

// node --test's spec reporter: "✔ name (123.456789ms)" / "✖ name (12ms)".
// Durations carry sub-microsecond precision, hence the loose decimal match.
const LINE = /^\s*[✔✖]\s+(.*?)\s+\((\d+(?:\.\d+)?)ms\)\s*$/;

function parse(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = LINE.exec(line);
    if (m) out.push({ name: m[1], ms: Number(m[2]) });
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
  const fixture = [
    "✔ a fast pure function (0.31ms)",
    "✔ a normal db test (120.5ms)",
    "✔ another db test (140.0ms)",
    "✔ a pathological waiter (467600.0ms)",
  ].join("\n");
  const tests = parse(fixture);
  if (tests.length !== 4) {
    console.error(`SELF-TEST FAILED: parsed ${tests.length} of 4 lines`);
    process.exit(1);
  }
  const dbClass = tests.filter((t) => t.ms >= DB_CLASS_FLOOR_MS).map((t) => t.ms);
  const med = median(dbClass);
  const flagged = tests.filter((t) => t.ms > ceiling || t.ms > med * MEDIAN_MULTIPLE);
  if (flagged.length !== 1 || !flagged[0].name.includes("pathological")) {
    console.error(`SELF-TEST FAILED: flagged ${flagged.length}, expected exactly the waiter`);
    process.exit(1);
  }
  console.log("self-test ok: parses spec output, computes the db-class median,");
  console.log(`and flags the outlier (${fmt(flagged[0].ms)} against a ${fmt(med)} median).`);
  process.exit(0);
}

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
    `running the suite as ${invocation.source} defines it (no --from given); ` +
      `this costs what the suite costs...`
  );
  const r = spawnSync(invocation.command, invocation.args, {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, ...invocation.env },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // A failing suite still produced timings; measure what we got and say so.
  text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) console.log("(the suite did not exit 0 - timings below are from that run)");
}

const tests = parse(text);
if (!tests.length) {
  console.error("REFUSING TO REPORT: parsed 0 timed tests.");
  console.error("A source with no parseable durations looks exactly like a fast suite.");
  console.error("Check that the input is `node --test` spec output with (Nms) durations.");
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
