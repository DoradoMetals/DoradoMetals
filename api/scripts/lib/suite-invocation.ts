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

import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * Splits a leading run of `VAR=value` assignments off an npm script body.
 * `TZ=UTC NODE_ENV=test node --test` -> { env: {...}, argv: ["node","--test"] }
 */
export type NpmScript = { env: Record<string, string>; argv: string[] };

export type Invocation = {
  command: string;
  args: string[];
  env: Record<string, string>;
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
 * The invocation `pnpm --filter @dorado/api test` performs, read from
 * api/package.json. Returns { command, args, env, source }.
 *
 * REFUSES rather than guesses. A package.json without a `test` script, or a
 * `test` script that does not run node, means this file's assumption has been
 * outgrown - and quietly falling back to a hardcoded `node --test` is precisely
 * how the original divergence survived.
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
  const { env, argv } = parseNpmScript(body);
  if (argv[0] !== "node") {
    throw new Error(
      `the "${scriptName}" script runs \`${argv[0]}\`, not node - ` +
        `scripts/lib/suite-invocation.mjs no longer understands how this suite is ` +
        `run and must be updated deliberately rather than guessing`
    );
  }
  // NODE_ENV and TZ are what is::test-run and the timestamp assertions depend
  // on. If the script body ever stops setting them, that is a change to the
  // suite's contract and every consumer of this should hear about it loudly.
  for (const required of ["NODE_ENV", "TZ"]) {
    if (!(required in env)) {
      throw new Error(
        `the "${scriptName}" script no longer sets ${required}. ` +
          `is-test-run.ts detects a test run by NODE_ENV *and* by --test in execArgv, ` +
          `"because either alone can be defeated"; losing one leaves the live mail, ` +
          `FedEx and Stripe clients behind a single check. Fix package.json or change ` +
          `this deliberately.`
      );
    }
  }
  return {
    command: process.execPath, // the node running us, not whatever is on PATH
    args: argv.slice(1),
    env,
    source: `${path.relative(root, pkgPath)} scripts.${scriptName}`,
    body,
  };
}
