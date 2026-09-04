// THE CLIENT BOUNDARY (ruling 62): `frontend/` talks to the API through
// `@dorado/client` and through nothing else.
//
// Two checks, one gate, both pinned by floors so a walk that opens nothing
// cannot pass by scanning nothing.
//
// (1) NOTHING UNDER frontend/ CALLS THE API DIRECTLY. No `fetch(`, no
//     `apiRequest`, no axios instance. Every endpoint has a hook in
//     packages/client; a component that reaches past it is a second place the
//     URL, the credentials mode and the error shape are spelled, which is how
//     `/api/cart` outlived its own deletion in three files.
//
// (2) packages/client IMPORTS NOTHING BUT @dorado/contracts, react and
//     react-query. It is the layer both sides agree on: a dependency on the
//     frontend's stores, its auth client or an HTTP library would make it the
//     frontend again, one directory over.
//
// WHAT IS DELIBERATELY ALLOWED. Types: `import type { … } from
// "@dorado/contracts"` anywhere in frontend/ is fine and always was - the
// contracts are the shared vocabulary, and re-exporting 163 names through the
// client to satisfy a lint would be ceremony. What is refused is the CALL.
//
//   node scripts/lint-client-boundary.ts
//   node scripts/lint-client-boundary.ts --self-test
//
// Exits non-zero on any unaccepted finding, or a stale ACCEPTED entry.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_CLIENT_BOUNDARY_ROOT
  ?? path.resolve(import.meta.dirname, "..", "..");

// A file that legitimately reaches the network without a hook, with the
// reason. PINNED FROM BOTH SIDES: an entry matching nothing is reported, so a
// file that stops needing the excuse cannot leave it here describing nothing.
const ACCEPTED: Record<string, string> = {
  "frontend/shared/queries/axios.ts":
    "the legacy transport, kept while the features other lanes own still " +
    "import it. Every checkout surface is off it (this lane); the file dies " +
    "with the last of the others.",
};

// SURFACES WHOSE OWN LANE HAS NOT CONVERTED YET. Prefixes, not files, because
// a feature converts whole - and PINNED FROM BOTH SIDES like ACCEPTED: a
// prefix under which nothing calls the API any more is reported, so this list
// can only shrink. `frontend/features/checkout` is deliberately absent: it is
// converted, and that is what makes the gate mean something today.
const PENDING: Record<string, string> = {
  "frontend/app/sitemap.ts": "the sitemap builds at request time on the server, outside react-query entirely.",
  "frontend/features/auth": "the auth surface - better-auth's own client plus two /users calls; not this lane's.",
  "frontend/features/media": "the media surface - not this lane's.",
  "frontend/features/orders": "the orders surface - the parallel orders lane owns it.",
  "frontend/features/payouts": "the payouts surface - not this lane's.",
  "frontend/features/pdfs": "the document surface - not this lane's.",
  "frontend/features/products": "the catalogue surface - not this lane's.",
  "frontend/features/quotes": "the remaining quote hooks (order + profit) - not this lane's; the two checkout quotes moved.",
  "frontend/features/refiners": "the refiner surface - not this lane's.",
  "frontend/shared/queries": "the legacy transport and its useApiQuery/useApiMutation wrappers, kept while the surfaces above still import them.",
};

const acceptedHit = new Set<string>();
const pendingHit = new Set<string>();

const pendingPrefix = (name: string): string | null =>
  Object.keys(PENDING).find((prefix) => name === prefix || name.startsWith(`${prefix}/`)) ?? null;

// The API calls a component must not make. `apiRequest`/`pdfRequest` are the
// legacy axios wrappers; `fetch(` is the raw one.
const CALLS = [
  { pattern: /\bapiRequest\s*[(<]/, what: "apiRequest" },
  { pattern: /\bpdfRequest\s*[(<]/, what: "pdfRequest" },
  { pattern: /(^|[^.\w])fetch\s*\(/, what: "fetch" },
  { pattern: /\baxios\b/, what: "axios" },
];

// What packages/client may import. Anything else - a store, a util, an HTTP
// library - is the finding.
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

// Comments carry prose that names `fetch` and `apiRequest` constantly - this
// file's own header does - so they are stripped before matching. String
// literals are kept: a URL in one is still a call being assembled.
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

function checkFrontend(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const name = rel(file);
    // A TEST may stub the network - that is what a test is for - and an e2e
    // spec drives a browser rather than the API.
    if (/\.test\.tsx?$/.test(name) || /\.e2e\.ts$/.test(name) || /[\\/]e2e[\\/]/.test(name)) {
      continue;
    }
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
    // PINNED FROM BOTH SIDES: an excuse counts as used only when the file it
    // names still makes the call. A file that stops calling forces its entry
    // out of the map instead of leaving it here describing nothing.
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

function checkClientPackage(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const specifier of importsOf(source)) {
      // Its own modules.
      if (specifier.startsWith(".")) continue;
      const bare = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (CLIENT_ALLOWED.has(bare)) continue;
      // A test may reach for the runner.
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

// A scan that opens nothing looks exactly like a clean repo. Both floors are
// literal counts of what the real tree holds today, well under it.
const FRONTEND_FLOOR = Number(process.env.LINT_CLIENT_BOUNDARY_FRONTEND_FLOOR ?? 100);
const CLIENT_FLOOR = Number(process.env.LINT_CLIENT_BOUNDARY_CLIENT_FLOOR ?? 4);

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const Q0 = String.fromCharCode(39);
  const filler: Record<string, string> = {};
  for (let i = 0; i < 6; i++) {
    filler[`frontend/features/f${i}/ui.tsx`] = "export const A = () => null\n";
  }
  // The ACCEPTED map is pinned from both sides, so every synthetic tree ships
  // its members STILL MAKING THE CALL - which is the other side of the pin.
  for (const rel of [...Object.keys(ACCEPTED), ...Object.keys(PENDING)]) {
    filler[rel.endsWith(".ts") ? rel : `${rel}/queries.ts`] =
      `export const go = () => fetch(${Q0}/x${Q0})\n`;
  }
  const clientFiller: Record<string, string> = {
    "packages/client/src/http.ts": "export const request = async () => null\n",
    "packages/client/src/keys.ts": "export const keys = {}\n",
    // ASSEMBLED, NOT WRITTEN: lint:imports walks scripts/ too, and a literal
    // relative specifier inside a fixture string is indistinguishable from a
    // real broken import - the exact trap that file's own header records.
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

const findings = [...checkFrontend(frontendFiles), ...checkClientPackage(clientFiles)];
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
