import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.resolve(import.meta.dirname, "..", "..");

export type NpmScript = { env: Record<string, string>; argv: string[] };

export type Invocation = {
  command: string;
  args: string[];
  env: Record<string, string>;
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

function splitChain(body: string): string[] {
  return body.split(/\s*&&\s*/).map((s) => s.trim()).filter(Boolean);
}

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
    command: process.execPath,
    args: argv.slice(1),
    env,
    shellCommand: body,
    source: `${path.relative(root, pkgPath)} scripts.${scriptName}`,
    body,
  };
}

const isMain = process.argv[1]?.endsWith("suite-invocation.ts") ?? false;

if (isMain && process.argv.includes("--self-test")) {
  const { selfTest, tree } = await import("./self-test-harness.ts");

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
