// THE ATTACK HARNESS. Every --self-test in scripts/ runs through this.
//
// NAMED `self-test-harness`, NOT `self-test`, AND THE SUFFIX IS LOad-BEARING.
// `node --test` with no arguments discovers `**/*-test.?(c|m)js` and the same
// patterns in TypeScript - so while this file was `self-test.mjs` THE SUITE
// IMPORTED IT AS A TEST FILE on every run. It contains no tests, so it counted
// as one passing file forever: the suite's own total was one higher than the
// number of test files, and every count derived from it inherited that. A
// library masquerading as a test in the suite that measures the tests is
// exactly the kind of thing this file exists to catch elsewhere.
//
// WHY IT EXISTS, and why it spawns rather than calls. D134's ruling is that a
// guard is verified by PLANTING A VIOLATION, not by reading its output - four
// gate scripts rotted while reporting success, and `route-guards.mjs` was
// actively PASSING while auditing a subset of routes. Reading a guard's output
// tells you what it SAYS; planting a violation tells you whether it can SEE.
//
// The three rots that a hand-written self-test would have missed were all in
// the WALK, not in the matcher:
//   - route-guards matched the exact filename `routes.ts`, so `creates.routes.ts`
//     was never opened (D120);
//   - audit-wire-readiness' first version walked zero files because it resolved
//     `api/frontend` (its own header says so);
//   - `diff` died on a SyntaxError before it opened a connection (D118).
// A self-test that imports a matcher function and feeds it a string proves the
// matcher works and exercises NONE of that. So this spawns the whole script as
// a child process, exactly as `pnpm` would, pointed at a synthetic tree by an
// environment variable the script honours. The walk, the parse, the argument
// handling and the exit code are all in the blast radius.
//
// D123's limit, stated so nobody reads more into a green self-test than is
// there: this proves the DETECTOR can see a planted change. It says NOTHING
// about the environment the subject runs in - which is exactly how
// `audit:test-leaks` rotted with a passing self-test, spawning the suite
// without NODE_ENV=test (D115). Scripts that spawn something else need the
// environmental assertions in `lint-script-guards.mjs` as well as one of these.
//
// USAGE, from a script's own --self-test branch:
//
//   await selfTest({
//     script: import.meta.filename,
//     cases: [
//       { name: "a planted violation is seen", rootEnv: "LINT_DB_ROOT",
//         files: { "features/a/repo.js": "...bad..." }, expect: "fail" },
//       { name: "a clean tree passes", rootEnv: "LINT_DB_ROOT",
//         files: { "features/a/repo.js": "...good..." }, expect: "pass" },
//     ],
//   });
//
// EVERY SUITE MUST CONTAIN BOTH DIRECTIONS. A detector that fails on everything
// passes an attack test and is useless, so a `fail` case with no matching `pass`
// case is itself refused below.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Materialises `files` into a fresh temp directory and returns its path.
 * Parent directories are created; the caller never has to order the keys.
 */
export type SelfTestCase = {
  name: string;
  files?: Record<string, string>;
  /** "fail" requires a NON-ZERO exit - the planted violation. */
  expect: "pass" | "fail";
  /** Environment variable the subject honours as its root, set to the temp tree. */
  rootEnv?: string;
  env?: Record<string, string>;
  args?: string[];
  mustPrint?: string | RegExp;
};

export function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dorado-selftest-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

/**
 * Runs `script` once per case against a synthetic tree and asserts the exit
 * code. Exits the process 0 if every case behaved, 1 otherwise.
 *
 * A case is `{ name, files, expect, rootEnv?, env?, args?, mustPrint? }`.
 *  - `expect: "fail"` requires a NON-ZERO exit. That is the planted violation.
 *  - `expect: "pass"` requires exit 0 on an equivalent clean tree. Without it a
 *    detector that fails unconditionally would score full marks.
 *  - `mustPrint` is a substring or RegExp the output must contain, so a case
 *    cannot pass by failing for an unrelated reason - a fixture typo, a missing
 *    directory, or the SyntaxError of D118.
 */
export async function selfTest({
  script,
  cases,
  cwd,
}: {
  script: string;
  cases: SelfTestCase[];
  cwd?: string;
}): Promise<never> {
  if (!cases.some((c) => c.expect === "fail") || !cases.some((c) => c.expect === "pass")) {
    console.error(
      "self-test suite must contain at least one `fail` case and one `pass` case - " +
        "a detector that refuses everything would otherwise score full marks"
    );
    process.exit(1);
  }

  let failed = 0;
  for (const c of cases) {
    const dir = tree(c.files ?? {});
    const env = { ...process.env, ...(c.env ?? {}) };
    if (c.rootEnv) env[c.rootEnv] = dir;
    const run = spawnSync(process.execPath, [script, ...(c.args ?? [])], {
      env,
      cwd: cwd ?? path.dirname(script),
      encoding: "utf8",
    });
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    const code = run.status;
    const wanted = c.expect === "fail" ? code !== 0 : code === 0;
    // A `pass` case that exits 0 because it crashed is not a pass, and a `fail`
    // case that exits non-zero on a SyntaxError proves nothing about the
    // detector. Both are caught by mustPrint where the case declares one.
    const printed =
      c.mustPrint == null
        ? true
        : c.mustPrint instanceof RegExp
          ? c.mustPrint.test(out)
          : out.includes(c.mustPrint);

    if (wanted && printed) {
      console.log(`  ok   ${c.name}  (exit ${code})`);
    } else {
      failed += 1;
      console.error(`  FAIL ${c.name}`);
      console.error(`       expected ${c.expect} (exit ${c.expect === "fail" ? "non-zero" : "0"}), got ${code}`);
      if (!printed) console.error(`       output did not contain ${c.mustPrint}`);
      console.error(out.split("\n").map((l) => `       | ${l}`).join("\n"));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const total = cases.length;
  if (failed) {
    console.error(`\nself-test FAILED: ${failed} of ${total} case(s) did not behave`);
    process.exit(1);
  }
  console.log(`\nself-test passed: ${total} case(s), planted violations all seen`);
  process.exit(0);
}
