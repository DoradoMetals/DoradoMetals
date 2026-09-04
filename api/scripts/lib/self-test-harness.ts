import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type SelfTestCase = {
  name: string;
  files?: Record<string, string>;
  expect: "pass" | "fail";
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
