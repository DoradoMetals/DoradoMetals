import fs from "node:fs";
import path from "node:path";
import { domainDirs, isTransportFile } from "./lib/layout.ts";

const ROOT = process.env.LINT_DOMAIN_ERRORS_ROOT
  ? path.resolve(process.env.LINT_DOMAIN_ERRORS_ROOT)
  : path.join(import.meta.dirname, "..");

const ROOTS = domainDirs(ROOT).map((d) => path.join(ROOT, d));
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const LOW = { LINT_DOMAIN_ERRORS_FLOOR: "1" };
  const manifest = {
    "package.json": JSON.stringify({ imports: { "#widgets/*": "./widgets/*" } }),
  };
  const clean =
    'import { NotFound } from "#shared/errors.ts";\n' +
    "export async function getOne(id: string) {\n" +
    "  const row = await repo.getOne(id);\n" +
    "  if (!row) throw new NotFound(`no thing ${id}`);\n" +
    "  return row;\n" +
    "}\n";

  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a statusCode assignment is seen",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          ...manifest,
          "widgets/service.ts":
            "function notFound(id: string) {\n" +
            "  const err: Error & { statusCode?: number } = new Error(`no widget ${id}`);\n" +
            "  err.statusCode = 404;\n" +
            "  return err;\n" +
            "}\n",
        },
        expect: "fail", mustPrint: "statusCode",
      },
      {
        name: "refuse( is seen",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          ...manifest,
          "widgets/service.ts":
            'import { refuse } from "#shared/http/refuse.ts";\n' +
            "export function bad() { throw refuse(400, \"nope\"); }\n",
        },
        expect: "fail", mustPrint: "refuse(",
      },
      {
        name: "refuseWith( is seen",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          ...manifest,
          "widgets/service.ts":
            'import { refuseWith } from "#shared/http/refuse.ts";\n' +
            "export function bad() { refuseWith(409, \"nope\"); }\n",
        },
        expect: "fail", mustPrint: "refuseWith(",
      },
      {
        name: "a local HttpError type is seen even with no statusCode write",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          ...manifest,
          "widgets/service.ts":
            "interface HttpError extends Error { statusCode?: number }\n" +
            "export function make(): HttpError { return new Error(\"x\"); }\n",
        },
        expect: "fail", mustPrint: "HttpError",
      },
      {
        name: "a violation in a test file is not a finding",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: {
          ...manifest,
          "widgets/service.ts": clean,
          "widgets/tests/service.test.ts":
            "const err: Error & { statusCode?: number } = new Error(\"x\");\n" +
            "err.statusCode = 404;\n",
        },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "shared/errors.ts kinds are not a finding",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": clean },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "the floor fires on a tree far below it",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT",
        files: { ...manifest, "widgets/service.ts": clean },
        expect: "fail", mustPrint: "fewer domain files",
      },
      {
        name: "a missing root is a broken walk, not an empty one",
        rootEnv: "LINT_DOMAIN_ERRORS_ROOT", env: LOW,
        files: { ...manifest }, args: ["--root-must-exist"],
        expect: "fail", mustPrint: "no .ts files",
      },
    ],
  });
}

const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bstatusCode\s*=/, "statusCode"],
  [/\brefuse\s*\(/, "refuse("],
  [/\brefuseWith\s*\(/, "refuseWith("],
  [/#shared\/http\/refuse/, "#shared/http/refuse"],
  [/\b(?:interface|type)\s+\w*HttpError\b/, "HttpError"],
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "tests") continue;
    const full = path.join(dir, e);
    let s;
    try { s = fs.statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(full) && !/\.d\.ts$/.test(full) && !/\.test\.ts$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const exists = ROOTS.some((d) => fs.existsSync(d));
const files = ROOTS.flatMap((d) => walk(d)).filter((f) => !isTransportFile(rel(f)));

if (!exists || files.length === 0) {
  console.error(
    `lint:domain-errors found no .ts files in ${ROOTS.join(", ")} - the walk is ` +
      `broken, not the domains empty.`
  );
  process.exit(1);
}

const FLOOR = Number(process.env.LINT_DOMAIN_ERRORS_FLOOR ?? 92);
if (files.length < FLOOR) {
  console.error(
    `lint:domain-errors scanned ${files.length} file(s) under ${ROOTS.join(", ")}, which is ` +
      `fewer domain files than exist (at least ${FLOOR}). A scan this small means ` +
      `the walk broke, not that the domains got smaller.`
  );
  process.exit(1);
}

const problems: string[] = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const [pattern, label] of PATTERNS) {
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        problems.push(`${rel(file)}:${i + 1}  ${label}\n      ${line.trim()}`);
      }
    });
  }
}

if (problems.length) {
  console.error(
    `domain-errors check failed (${problems.length} finding(s)):\n\n` +
      `  A domain file names the KIND of refusal - Invalid, NotFound, Conflict,\n` +
      `  Forbidden from #shared/errors.ts - and shared/middleware/errorHandler.ts\n` +
      `  maps it to a status. No domain file spells an HTTP status, builds\n` +
      `  an error with statusCode, or calls refuse/refuseWith from\n` +
      `  #shared/http/refuse.ts.\n`
  );
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log(
  `domain-errors check passed (${files.length} file${files.length === 1 ? "" : "s"} scanned, 0 findings)`
);
