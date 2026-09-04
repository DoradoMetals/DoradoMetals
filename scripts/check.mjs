#!/usr/bin/env node
// The parallel gate runner (phase5-fast-gate.md task 3).
//
// `pnpm check` runs 27 members in one long serial chain today. Most of them
// are mutually independent - eight static API lints, the dev-database audits,
// the frontend/components lanes - and only pay for being serial because the
// chain was written as one line. This runs the SAME 27 commands, grouped by
// what they actually depend on, and lets independent groups run concurrently.
//
// WHAT MUST STAY SERIAL, AND WHY:
//   - `contracts build` first, always. The api and frontend workspaces import
//     @dorado/contracts' BUILT dist output (see packages/contracts/package.json
//     "main": "./dist/index.js"), not its source - so nothing that imports
//     @dorado/contracts can start before the build finishes.
//   - Group DB: every step in it touches the real dev Postgres, either the
//     eight read-only audits or contracts' own verify:fresh/validate (both
//     read DATABASE_URL). D196 recorded a livelock from concurrent dev
//     queries during a run, so this group is one line at a time, in the
//     order `check` already used - it just runs alongside the other groups
//     instead of blocking them.
//   - Group API: typecheck before test. Not required for correctness (the
//     suite runs on Node's native TS stripping, not tsc's output) but a type
//     error should be reported before spending 20s on the suite, matching the
//     original chain's order.
//
// Everything else - the 8 static API lints, components' typecheck+test, and
// frontend's lint+typecheck+test+build - has no shared mutable state, so each
// runs as its own concurrent step within its group.
//
// Usage:
//   node scripts/check.mjs           runs every group (what `pnpm check` calls)
//   node scripts/check.mjs --fast    runs only the contracts build + API groups
//                                    (what `pnpm check:fast` calls)
//
// Per-step output goes to .check-logs/<step>.log (gitignored) and is only
// printed to the console when that step fails. One line per step reports its
// own duration as it finishes; the end-of-run summary reports total wall
// clock and which group was the critical path (the slowest one - the one
// that, if shortened, would shorten the whole run).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const LOGDIR = path.join(ROOT, ".check-logs");
rmSync(LOGDIR, { recursive: true, force: true });
mkdirSync(LOGDIR, { recursive: true });

const FAST = process.argv.includes("--fast");

// One shell command per step. `pnpm --filter X run` keeps each step's stdout
// naming its own workspace on failure, same as the current chain.
const pnpm = (filter, script) => `pnpm --filter ${filter} ${script}`;

/** @typedef {{ name: string, cmd: string }} Step */

/**
 * A group is a named set of steps. `parallel: true` runs its steps
 * concurrently (they share no mutable state); `parallel: false` runs them as
 * a chain, stopping at the first failure - used only where order matters or
 * a shared resource forces it.
 */
const GROUPS = [
  {
    name: "api-lint",
    parallel: true,
    steps: [
      { name: "api:lint:imports", cmd: pnpm("@dorado/api", "lint:imports") },
      { name: "api:lint:namespace-calls", cmd: pnpm("@dorado/api", "lint:namespace-calls") },
      { name: "api:lint:row-vs-list", cmd: pnpm("@dorado/api", "lint:row-vs-list") },
      { name: "api:lint:db", cmd: pnpm("@dorado/api", "lint:db") },
      { name: "api:lint:migrations", cmd: pnpm("@dorado/api", "lint:migrations") },
      {
        name: "api:lint:domain-boundaries",
        cmd: pnpm("@dorado/api", "lint:domain-boundaries"),
      },
      { name: "api:lint:script-guards", cmd: pnpm("@dorado/api", "lint:script-guards") },
      { name: "api:lint:type-homes", cmd: pnpm("@dorado/api", "lint:type-homes") },
      { name: "api:lint:contracts-derived", cmd: pnpm("@dorado/api", "lint:contracts-derived") },
      { name: "api:lint:domain-errors", cmd: pnpm("@dorado/api", "lint:domain-errors") },
      { name: "api:lint:one-catch", cmd: pnpm("@dorado/api", "lint:one-catch") },
      {
        name: "api:lint:no-throw-in-services",
        cmd: pnpm("@dorado/api", "lint:no-throw-in-services"),
      },
      {
        name: "api:lint:no-column-arrays",
        cmd: pnpm("@dorado/api", "lint:no-column-arrays"),
      },
      { name: "api:lint:input-shapes", cmd: pnpm("@dorado/api", "lint:input-shapes") },
      { name: "api:lint:client-boundary", cmd: pnpm("@dorado/api", "lint:client-boundary") },
      { name: "api:lint:test-locks", cmd: pnpm("@dorado/api", "lint:test-locks") },
      { name: "api:lint:test-actor", cmd: pnpm("@dorado/api", "lint:test-actor") },
      { name: "api:audit:silent-mutations", cmd: pnpm("@dorado/api", "audit:silent-mutations") },
    ],
  },
  {
    name: "api-test",
    parallel: false,
    steps: [
      { name: "api:typecheck", cmd: pnpm("@dorado/api", "typecheck") },
      // `check` (full, not --fast) runs test:coverage instead of plain test -
      // one run of the suite instead of two (test-suite-redesign.md 2.6/lane
      // 7). Measured 2026-09-03: typecheck ~1s + test:coverage ~24s keeps
      // this group at ~25s, under the ~40s budget that decision was
      // conditioned on, so the swap costs nothing check:fast would have paid
      // for anyway. check:fast stays on plain `test` (no coverage
      // instrumentation) on purpose - it exists for fast iteration, and
      // coverage's own thresholds already gate the one thing check:fast does
      // not: db/domain/transport/shared each staying at or above their
      // measured floor (vitest.config.ts's own comment has the ratchet rule).
      { name: "api:test", cmd: pnpm("@dorado/api", FAST ? "test" : "test:coverage") },
    ],
  },
  {
    name: "design",
    // The Figma sync checks. Pure file reads against the committed snapshot at
    // scripts/figma/snapshot.json - no database, no network, no build, ~100ms
    // for all three - so they sit in the fast set and cost check:fast nothing
    // measurable. They do not depend on the contracts build either.
    parallel: true,
    steps: [
      { name: "figma:tokens", cmd: "node scripts/figma/check-tokens.mjs" },
      { name: "figma:inventory", cmd: "node scripts/figma/check-inventory.mjs" },
      { name: "figma:hygiene", cmd: "node scripts/figma/check-hygiene.mjs" },
    ],
  },
];

const FULL_ONLY_GROUPS = [
  {
    name: "components",
    // Measured serial (this file's header numbers) vs a first parallel-group
    // attempt: `test` alone spawns vitest's own worker pool (one thread per
    // core by default), and running it at the same time as api-test's ~24
    // file-processes AND frontend's vitest/next workers oversubscribed the
    // 24 cores badly enough that a real run measured `components:test` at
    // 269s (vs ~8s serial) and FAILED a Tooltip test on a 5000ms timeout that
    // is not flaky in isolation - pure resource starvation, not a real bug.
    // Groups still race each other (that is where the real win is); the fix
    // is to stop each group ALSO racing its own steps against itself.
    parallel: false,
    steps: [
      { name: "icons:typecheck", cmd: pnpm("@dorado/icons", "typecheck") },
      { name: "components:typecheck", cmd: pnpm("@dorado/components", "typecheck") },
      { name: "components:test", cmd: pnpm("@dorado/components", "test") },
      { name: "client:typecheck", cmd: pnpm("@dorado/client", "typecheck") },
      { name: "client:test", cmd: pnpm("@dorado/client", "test") },
    ],
  },
  {
    name: "frontend",
    // Serial for the same reason as components above: `test` (vitest) and
    // `build` (next, its own worker pool) are each already internally
    // parallel. The same measured run had `frontend:build` at 351s against a
    // serial baseline of 68s.
    parallel: false,
    steps: [
      { name: "frontend:lint:carrier-vocabulary", cmd: pnpm("@dorado/frontend", "lint:carrier-vocabulary") },
      { name: "frontend:typecheck", cmd: pnpm("@dorado/frontend", "typecheck") },
      { name: "frontend:test", cmd: pnpm("@dorado/frontend", "test") },
      { name: "frontend:build", cmd: pnpm("@dorado/frontend", "build") },
    ],
  },
  {
    name: "dev-db",
    // Everything here reads the real dev Postgres (contracts' verify:fresh
    // and validate included - both read DATABASE_URL). D196: concurrent dev
    // queries during a run livelocked. One at a time, same order `check` used.
    parallel: false,
    steps: [
      { name: "contracts:verify:fresh", cmd: pnpm("@dorado/contracts", "verify:fresh") },
      { name: "contracts:validate", cmd: pnpm("@dorado/contracts", "validate") },
      { name: "api:verify:genesis", cmd: pnpm("@dorado/api", "verify:genesis") },
      { name: "api:validate:wire", cmd: pnpm("@dorado/api", "validate:wire") },
      { name: "api:audit:coverage", cmd: pnpm("@dorado/api", "audit:coverage") },
      { name: "api:audit:indexes", cmd: pnpm("@dorado/api", "audit:indexes") },
      { name: "api:audit:query-paths", cmd: pnpm("@dorado/api", "audit:query-paths") },
      { name: "api:audit:constraints", cmd: pnpm("@dorado/api", "audit:constraints") },
      { name: "api:audit:non-finite", cmd: pnpm("@dorado/api", "audit:non-finite") },
      { name: "api:audit:nullability", cmd: pnpm("@dorado/api", "audit:nullability") },
    ],
  },
];

const groups = FAST ? GROUPS : [...GROUPS, ...FULL_ONLY_GROUPS];

function slug(name) {
  return name.replace(/[^a-z0-9]+/gi, "_");
}

function runStep(step) {
  const logfile = path.join(LOGDIR, `${slug(step.name)}.log`);
  const start = performance.now();
  return new Promise((resolve) => {
    const child = spawn(step.cmd, { cwd: ROOT, shell: true });
    const chunks = [];
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    child.on("close", (code) => {
      const seconds = (performance.now() - start) / 1000;
      writeFileSync(logfile, Buffer.concat(chunks));
      const ok = code === 0;
      const mark = ok ? "OK  " : "FAIL";
      console.log(`[${mark}] ${step.name.padEnd(34)} ${seconds.toFixed(2)}s`);
      if (!ok) {
        console.log(`--- ${step.name} failed (exit ${code}); log follows ---`);
        process.stdout.write(Buffer.concat(chunks));
        console.log(`--- end ${step.name} (full log: ${path.relative(ROOT, logfile)}) ---`);
      }
      resolve({ name: step.name, seconds, ok });
    });
  });
}

async function runChain(steps) {
  const results = [];
  for (const step of steps) {
    const r = await runStep(step);
    results.push(r);
    if (!r.ok) break; // stop this chain; other groups keep running
  }
  return results;
}

async function runGroup(group) {
  const start = performance.now();
  const results = group.parallel
    ? await Promise.all(group.steps.map(runStep))
    : await runChain(group.steps);
  const seconds = (performance.now() - start) / 1000;
  const ok = results.every((r) => r.ok) && results.length === group.steps.length;
  return { name: group.name, seconds, ok, results };
}

async function main() {
  console.log(`check.mjs: ${FAST ? "fast (contracts build + api groups)" : "full"} run starting`);
  const wallStart = performance.now();

  const build = await runStep({ name: "contracts:build", cmd: pnpm("@dorado/contracts", "build") });
  if (!build.ok) {
    console.log("\ncontracts build failed; nothing else can run.");
    process.exit(1);
  }

  const groupResults = await Promise.all(groups.map(runGroup));

  const wallSeconds = (performance.now() - wallStart) / 1000;
  const allOk = groupResults.every((g) => g.ok);
  const critical = [...groupResults].sort((a, b) => b.seconds - a.seconds)[0];

  console.log("\n--- group durations ---");
  for (const g of groupResults) {
    console.log(`${g.ok ? "OK  " : "FAIL"} ${g.name.padEnd(12)} ${g.seconds.toFixed(2)}s`);
  }
  console.log(`\nwall clock: ${wallSeconds.toFixed(2)}s (contracts:build ${build.seconds.toFixed(2)}s + critical path "${critical.name}" ${critical.seconds.toFixed(2)}s)`);
  console.log(allOk ? "\ncheck.mjs: PASS" : "\ncheck.mjs: FAIL");
  process.exit(allOk ? 0 : 1);
}

main();
