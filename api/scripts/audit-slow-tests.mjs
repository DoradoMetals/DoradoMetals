import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { suiteInvocation } from "./lib/suite-invocation.ts";

const CEILING_MS = 10_000;
const MEDIAN_MULTIPLE = 20;
const DB_CLASS_FLOOR_MS = 50;

const ACCEPTED = {
};

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
const thrIdx = args.indexOf("--threshold");
const ceiling = thrIdx >= 0 ? Number(args[thrIdx + 1]) : CEILING_MS;

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

if (selfTest) {
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
const REPORT_FILE = path.join(SUITE_CWD, ".check-logs", "audit-slow-tests.json");

let text;
if (from) {
  text = readFileSync(from, "utf8");
} else {
  const invocation = suiteInvocation();
  console.log(
    `running the suite as ${invocation.source} defines it (no --from given), ` +
      `plus a JSON reporter for timings; this costs what the suite costs...`
  );
  mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  rmSync(REPORT_FILE, { force: true });
  const command =
    `${invocation.shellCommand} --reporter=default --reporter=json --outputFile="${REPORT_FILE}"`;
  const r = spawnSync(command, {
    cwd: SUITE_CWD,
    env: { ...process.env },
    stdio: ["ignore", "inherit", "inherit"],
    shell: true,
  });
  if (r.status !== 0) console.log("(the suite did not exit 0 - timings below are from that run)");
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
