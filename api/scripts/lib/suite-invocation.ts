// HOW TO RUN THE SUITE, READ FROM package.json RATHER THAN REPRODUCED.
//
// D115/D123, and it is the one rule a --self-test cannot enforce.
// `scripts/audit-test-leaks.mjs` - the audit whose ENTIRE PURPOSE is proving
// the suite touches nothing live - spawned `node --test` with TZ set and
// NOT NODE_ENV=test. `shared/testing/is-test-run.ts` detects a test run two
// ways "because either alone can be defeated": NODE_ENV, and a `--test` flag in
// execArgv. So the guard that keeps tests off the real mail transport, the real
// FedEx client and the real Stripe client RAN WITH ONE OF ITS TWO LEGS DEAD,
// every time that audit ran. Nothing escaped - the execArgv leg held, which is
// why the file has two - but the margin the comment describes was gone.
//
// It HAD a --self-test and rotted anyway, because the failure was
// ENVIRONMENTAL. A self-test proves the DETECTOR can see a change; it says
// nothing about the environment the SUBJECT runs in.
//
// So the fix is not "remember NODE_ENV". It is: DO NOT ASSEMBLE AN INVOCATION.
// `pnpm test` is defined in exactly one place, and this reads that place. If the
// suite's invocation gains a flag or a variable tomorrow, every script that
// runs the suite gains it in the same commit, because none of them spells it
// out. The tell that made D115 findable was that the audit DISAGREED WITH THE
// SUITE IT AUDITS - 915/916 against 916/916. Reading the definition is what
// makes that disagreement impossible rather than merely noticed.
//
// *** SECOND ROT, SAME CLASS (lane 4, 2026-09-03). *** The `test` script
// became a `&&` CHAIN - preflight, then the real suite - when the network
// guard's preload landed. `parseNpmScript` (below) was written for ONE
// command: it splits leading `VAR=value` tokens off the front and treats
// everything else as a single argv array, so `node scripts/preflight-
// test-db.ts && TZ=UTC NODE_ENV=test node --import ... --test ...` parsed
// into argv = ["node", "scripts/preflight-test-db.ts", "&&", "TZ=UTC", ...]
// - every token after the first `node` handed to it as a literal CLI
// argument, `&&` included, which a plain (non-shell) `spawn()` does not
// interpret at all. The preflight script ignores arguments it does not
// recognise and exits 0 having done nothing but its own job, so
// audit:test-leaks's "suite exited 0" was true of a process that never ran a
// single test - vacuously green on a red suite. audit:slow-tests hit the
// same parse and failed LOUDLY instead (it parses `(Nms)` durations out of
// the output and the preflight prints none), which is the only reason it was
// ever noticed at all.
//
// THE FIX IS THE SAME SHAPE AS THE FIRST ONE: stop trying to re-derive
// argv/env for `spawn()` and run the script body exactly as `pnpm` runs it -
// through a shell, unparsed, chain and all. `shellCommand` carries the raw
// body for that; `env`/`argv` are still extracted (from the LAST `&&`
// segment - the one that actually executes tests) purely so this can keep
// asserting NODE_ENV/TZ are set on the segment `isTestRun()` depends on, and
// so callers can print what is about to run. Spawning uses `shellCommand`
// only - `command`/`args` are not safe to spawn directly without a shell and
// are kept for logging and for the one caller (audit:slow-tests) that wants
// the plain argv for its own message.

import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * Splits a leading run of `VAR=value` assignments off an npm script body.
 * `TZ=UTC NODE_ENV=test node --test` -> { env: {...}, argv: ["node","--test"] }
 */
export type NpmScript = { env: Record<string, string>; argv: string[] };

export type Invocation = {
  /** The LAST `&&` segment's command, after its own env assignments. Not safe to spawn directly - see shellCommand. */
  command: string;
  /** The LAST `&&` segment's argv, after its own env assignments. */
  args: string[];
  /** The LAST `&&` segment's env assignments (NODE_ENV, TZ, ...). */
  env: Record<string, string>;
  /** The FULL, UNPARSED script body - every `&&` segment, in order. This is what must be spawned, and only a shell (`spawn(shellCommand, { shell: true, ... })`) runs it the way `pnpm` does. */
  shellCommand: string;
  source: string;
  body: string;
};

export function parseNpmScript(body: string): NpmScript {
  const parts = body.trim().split(/\s+/);
  const env: Record<string, string> = {};
  let i = 0;
  for (; i < parts.length; i += 1) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(parts[i]);
    if (!m) break;
    env[m[1]] = m[2];
  }
  return { env, argv: parts.slice(i) };
}

/**
 * Splits an npm script body on top-level `&&`. Deliberately naive (no quote-
 * awareness) - every script this reads today is a plain chain of
 * `VAR=value... node ...` segments with no embedded `&&` in a string, and a
 * segment that needed one would be a reason to look at this function, not a
 * silent misparse: the two validated properties (argv[0] === "node",
 * NODE_ENV/TZ present) still refuse loudly if a split lands somewhere odd.
 */
function splitChain(body: string): string[] {
  return body.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The invocation `pnpm --filter @dorado/api test` performs, read from
 * api/package.json. Returns an Invocation whose `shellCommand` is the exact,
 * unparsed script body - spawn THAT, through a shell, to run the suite the
 * way pnpm does even when the script is a `&&` chain.
 *
 * REFUSES rather than guesses. A package.json without a `test` script, or a
 * `test` script whose LAST segment does not run node, means this file's
 * assumption has been outgrown - and quietly falling back to a hardcoded
 * `node --test` is precisely how the original divergence survived.
 */
export function suiteInvocation({
  root = API_ROOT,
  scriptName = "test",
}: { root?: string; scriptName?: string } = {}): Invocation {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string | undefined>;
  };
  const body = pkg.scripts?.[scriptName];
  if (!body) {
    throw new Error(
      `${pkgPath} has no "${scriptName}" script - cannot run the suite the way ` +
        `pnpm does, and must not invent an invocation of its own`
    );
  }
  // THE LAST SEGMENT IS THE ONE THAT MATTERS FOR THIS VALIDATION. A chain may
  // front-load setup (preflight-test-db.ts today) that does not itself run
  // tests and has no reason to satisfy isTestRun() - what must run node with
  // NODE_ENV/TZ set is whichever segment actually executes the suite, and in
  // an `&&` chain that is always the last one still standing (an earlier
  // segment failing stops the chain before this one runs at all).
  const segments = splitChain(body);
  const last = segments[segments.length - 1]!;
  const { env, argv } = parseNpmScript(last);
  if (argv[0] !== "node") {
    throw new Error(
      `the "${scriptName}" script's last segment runs \`${argv[0]}\`, not node - ` +
        `scripts/lib/suite-invocation.ts no longer understands how this suite is ` +
        `run and must be updated deliberately rather than guessing. Segment: ${last}`
    );
  }
  // NODE_ENV and TZ are what is-test-run and the timestamp assertions depend
  // on. If the script's last segment ever stops setting them, that is a change
  // to the suite's contract and every consumer of this should hear about it
  // loudly.
  for (const required of ["NODE_ENV", "TZ"]) {
    if (!(required in env)) {
      throw new Error(
        `the "${scriptName}" script's last segment no longer sets ${required}. ` +
          `is-test-run.ts detects a test run by NODE_ENV *and* by --test in execArgv, ` +
          `"because either alone can be defeated"; losing one leaves the live mail, ` +
          `FedEx and Stripe clients behind a single check. Fix package.json or change ` +
          `this deliberately. Segment: ${last}`
      );
    }
  }
  return {
    command: process.execPath, // the node running us, not whatever is on PATH - logging only, see shellCommand
    args: argv.slice(1),
    env,
    shellCommand: body,
    source: `${path.relative(root, pkgPath)} scripts.${scriptName}`,
    body,
  };
}

// *** THE SELF-TEST FOR THE SECOND ROT, NOT JUST THE FIRST. *** Only fires
// when THIS file is run directly (`node scripts/lib/suite-invocation.ts
// --self-test`) - not merely imported by another script's own --self-test
// run, which would otherwise also see `--self-test` in process.argv and
// fire a second, unrelated self-test as a side effect of being imported.
//
// D134's ruling: verify by PLANTING A VIOLATION and watching the detector
// see it, not by reading what the detector says about itself. So this does
// not call suiteInvocation() and inspect the returned Invocation - it builds
// a synthetic package.json whose "test" script is a REAL `&&` CHAIN (first
// segment succeeds and prints nothing useful, last segment is `node -e
// "process.exit(7)"`), calls suiteInvocation() against that synthetic root,
// SPAWNS invocation.shellCommand exactly as audit-test-leaks.ts and
// audit-slow-tests.mjs now do, and exits with whatever code that chain
// produced. The self-test-harness (scripts/lib/self-test-harness.ts) then
// spawns THIS file the same way `pnpm` would and asserts on ITS exit code -
// so the assertion is on a real subprocess's real exit status, the same
// distance from the bug as the two real callers are.
//
// The "fail" case's fixture chain exits 7; a version of this file that still
// mis-parsed the chain (the D115-era bug) would run only the first segment,
// which exits 0 - so this case is exactly the one the original defect would
// have failed silently on.
const isMain = process.argv[1]?.endsWith("suite-invocation.ts") ?? false;

if (isMain && process.argv.includes("--self-test")) {
  const { selfTest, tree } = await import("./self-test-harness.ts");

  // The wrapper script self-test-harness spawns: reads the synthetic
  // package.json via SUITE_INVOCATION_ROOT, spawns the chain for real, and
  // exits with the chain's own code - proving propagation end to end rather
  // than asserting on a returned string.
  const CHILD_PROCESS_SPECIFIER = "node:" + "child_process";
  const RUNNER = `
    import { suiteInvocation } from ${JSON.stringify(new URL("./suite-invocation.ts", import.meta.url).pathname)};
    import { spawn } from ${JSON.stringify(CHILD_PROCESS_SPECIFIER)};
    const invocation = suiteInvocation({ root: process.env.SUITE_INVOCATION_ROOT });
    const child = spawn(invocation.shellCommand, { shell: true, stdio: "inherit" });
    child.on("close", (code) => process.exit(code ?? 1));
  `;
  const runnerDir = tree({ "run.mjs": RUNNER });
  const runnerPath = `${runnerDir}/run.mjs`;

  await selfTest({
    script: runnerPath,
    cases: [
      {
        name: "a failing LAST segment of a && chain propagates its real exit code",
        env: {
          SUITE_INVOCATION_ROOT: tree({
            "package.json": JSON.stringify({
              scripts: {
                test: 'TZ=UTC NODE_ENV=test node -e "0" && ' +
                  'TZ=UTC NODE_ENV=test node -e "process.exit(7)"',
              },
            }),
          }),
        },
        expect: "fail",
      },
      {
        name: "a passing chain still propagates a zero exit",
        env: {
          SUITE_INVOCATION_ROOT: tree({
            "package.json": JSON.stringify({
              scripts: {
                test: 'TZ=UTC NODE_ENV=test node -e "0" && ' +
                  'TZ=UTC NODE_ENV=test node -e "process.exit(0)"',
              },
            }),
          }),
        },
        expect: "pass",
      },
    ],
  });
}
