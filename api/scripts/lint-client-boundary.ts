import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_CLIENT_BOUNDARY_ROOT
  ?? path.resolve(import.meta.dirname, "..", "..");

const ACCEPTED: Record<string, string> = {};

const PENDING: Record<string, string> = {};

const PROVIDER_FILE = "frontend/shared/providers/QueryProvider.tsx";

const acceptedHit = new Set<string>();
const pendingHit = new Set<string>();

const pendingPrefix = (name: string): string | null =>
  Object.keys(PENDING).find((prefix) => name === prefix || name.startsWith(`${prefix}/`)) ?? null;

const CALLS = [
  { pattern: /\bapiRequest\s*[(<]/, what: "apiRequest" },
  { pattern: /\bpdfRequest\s*[(<]/, what: "pdfRequest" },
  { pattern: /(^|[^.\w])fetch\s*\(/, what: "fetch" },
  { pattern: /\baxios\b/, what: "axios" },
];

const CLIENT_ALLOWED = new Set(["@dorado/contracts", "react", "react-dom", "@tanstack/react-query"]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", "playwright-report",
  "test-results",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.d\.ts$/.test(full)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']/g)]
    .map((m) => m[1])
    .concat(
      [...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])
    );

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

type Finding = { file: string; line: number; message: string };

const isTestFile = (name: string): boolean =>
  /\.test\.tsx?$/.test(name) || /\.e2e\.ts$/.test(name) ||
  /[\\/]e2e[\\/]/.test(name) || /[\\/]tests[\\/]/.test(name);

function checkFrontend(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const name = rel(file);
    if (isTestFile(name)) continue;
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    const hits: Finding[] = [];
    lines.forEach((line, i) => {
      for (const { pattern, what } of CALLS) {
        if (pattern.test(line)) {
          hits.push({
            file: name, line: i + 1,
            message: `calls ${what} directly - the endpoint belongs in @dorado/client`,
          });
        }
      }
    });
    if (ACCEPTED[name]) {
      if (hits.length > 0) acceptedHit.add(name);
      continue;
    }
    const pending = pendingPrefix(name);
    if (pending) {
      if (hits.length > 0) pendingHit.add(pending);
      continue;
    }
    findings.push(...hits);
  }
  return findings;
}

function checkReactQueryImports(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const name = rel(file);
    if (name === PROVIDER_FILE) continue;
    if (isTestFile(name)) continue;
    const source = readFileSync(file, "utf8");
    for (const specifier of importsOf(source)) {
      if (specifier !== "@tanstack/react-query") continue;
      findings.push({
        file: name, line: 0,
        message: "imports @tanstack/react-query - every hook and query key belongs in " +
          `@dorado/client now (the one exception is ${PROVIDER_FILE})`,
      });
    }
  }
  return findings;
}

function checkClientPackage(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const specifier of importsOf(source)) {
      if (specifier.startsWith(".")) continue;
      const bare = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (CLIENT_ALLOWED.has(bare)) continue;
      if (/\.test\.tsx?$/.test(file) && bare === "vitest") continue;
      findings.push({
        file: rel(file), line: 0,
        message: `imports ${specifier} - packages/client may import only ` +
          `${[...CLIENT_ALLOWED].join(", ")}`,
      });
    }
  }
  return findings;
}

const FRONTEND_FLOOR = Number(process.env.LINT_CLIENT_BOUNDARY_FRONTEND_FLOOR ?? 100);
const CLIENT_FLOOR = Number(process.env.LINT_CLIENT_BOUNDARY_CLIENT_FLOOR ?? 4);

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const Q0 = String.fromCharCode(39);
  const filler: Record<string, string> = {};
  for (let i = 0; i < 6; i++) {
    filler[`frontend/features/f${i}/ui.tsx`] = "export const A = () => null\n";
  }
  for (const rel of [...Object.keys(ACCEPTED), ...Object.keys(PENDING)]) {
    filler[rel.endsWith(".ts") ? rel : `${rel}/queries.ts`] =
      `export const go = () => fetch(${Q0}/x${Q0})\n`;
  }
  const clientFiller: Record<string, string> = {
    "packages/client/src/http.ts": "export const request = async () => null\n",
    "packages/client/src/keys.ts": "export const keys = {}\n",
    "packages/client/src/index.ts": `export * from ${Q0}./http.js${Q0}\n`,
    "packages/client/src/checkout/queries.ts":
      "import { useQuery } from '@tanstack/react-query'\nexport const use = useQuery\n",
  };
  const LOW = { LINT_CLIENT_BOUNDARY_FRONTEND_FLOOR: "1", LINT_CLIENT_BOUNDARY_CLIENT_FLOOR: "1" };
  const Q = String.fromCharCode(39);
  const call = (what: string) => `export const go = () => ${what}(${Q}/checkout${Q})\n`;

  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "a component calling fetch is seen",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: { ...filler, ...clientFiller, "frontend/features/x/ui.tsx": call("fetch") },
        expect: "fail",
        mustPrint: "calls fetch directly",
      },
      {
        name: "a component calling apiRequest is seen",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: { ...filler, ...clientFiller, "frontend/features/x/ui.tsx": call("apiRequest") },
        expect: "fail",
        mustPrint: "calls apiRequest directly",
      },
      {
        name: "a component importing a hook from @dorado/client passes",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          "frontend/features/x/ui.tsx":
            `import { useCheckout } from ${Q}@dorado/client${Q}\nexport const go = () => useCheckout(${Q}sale${Q})\n`,
        },
        expect: "pass",
        mustPrint: "0 findings",
      },
      {
        name: "a component importing @tanstack/react-query directly is seen",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          "frontend/features/x/ui.tsx":
            `import { useQueryClient } from ${Q}@tanstack/react-query${Q}\nexport const go = () => useQueryClient()\n`,
        },
        expect: "fail",
        mustPrint: "imports @tanstack/react-query",
      },
      {
        name: "the provider file importing @tanstack/react-query passes",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          [PROVIDER_FILE]:
            `import { QueryClientProvider } from ${Q}@tanstack/react-query${Q}\nexport default QueryClientProvider\n`,
        },
        expect: "pass",
        mustPrint: "0 findings",
      },
      {
        name: "a type import from the contracts is not a call",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          "frontend/features/x/ui.tsx":
            `import type { Checkout } from ${Q}@dorado/contracts${Q}\nexport type A = Checkout\n`,
        },
        expect: "pass",
      },
      {
        name: "the word fetch in a comment is prose, not a call",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          "frontend/features/x/ui.tsx": "// never call fetch( here\nexport const A = () => null\n",
        },
        expect: "pass",
      },
      {
        name: "the client package reaching for axios is seen",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          "packages/client/src/bad.ts": `import axios from ${Q}axios${Q}\nexport default axios\n`,
        },
        expect: "fail",
        mustPrint: "packages/client may import only",
      },
      {
        name: "the client package reaching into the frontend is seen",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT", env: LOW,
        files: {
          ...filler, ...clientFiller,
          "packages/client/src/bad.ts":
            `import { useCheckoutItems } from ${Q}@dorado/frontend${Q}\nexport default useCheckoutItems\n`,
        },
        expect: "fail",
        mustPrint: "packages/client may import only",
      },
      {
        name: "an empty frontend tree is a BROKEN scan, not a clean one",
        rootEnv: "LINT_CLIENT_BOUNDARY_ROOT",
        files: { ...clientFiller },
        expect: "fail",
        mustPrint: "SCAN IS BROKEN",
      },
    ],
  });
}

const frontendFiles = walk(path.join(ROOT, "frontend"));
const clientFiles = walk(path.join(ROOT, "packages", "client", "src"));

if (frontendFiles.length < FRONTEND_FLOOR || clientFiles.length < CLIENT_FLOOR) {
  console.error(
    `SCAN IS BROKEN: opened ${frontendFiles.length} frontend and ${clientFiles.length} ` +
    `client files (floors ${FRONTEND_FLOOR}/${CLIENT_FLOOR}). A walk that finds nothing ` +
    `passes everything.`
  );
  process.exit(1);
}

const findings = [
  ...checkFrontend(frontendFiles),
  ...checkReactQueryImports(frontendFiles),
  ...checkClientPackage(clientFiles),
];
const stale = [
  ...Object.keys(ACCEPTED).filter((name) => !acceptedHit.has(name)),
  ...Object.keys(PENDING).filter((prefix) => !pendingHit.has(prefix)),
];

for (const f of findings) {
  console.error(`${f.file}${f.line ? `:${f.line}` : ""}  ${f.message}`);
}
for (const name of stale) {
  console.error(`STALE ACCEPTED entry: ${name} no longer exists or no longer needs the excuse`);
}

console.log(
  `lint:client-boundary - ${frontendFiles.length} frontend files, ${clientFiles.length} ` +
  `client files, ${findings.length} findings, ${Object.keys(ACCEPTED).length} accepted, ` +
  `${pendingHit.size}/${Object.keys(PENDING).length} surfaces still pending`
);

process.exit(findings.length + stale.length > 0 ? 1 : 0);
