// Ruling 78 (Jacob, 2026-09-05): "that calculateSalesOrder dictionary thing is
// tragic to look at. We shouldn't be doing anything like that ever... The only
// thing we care about from legacy code is the logic. The code itself? Fully
// comfortable throwing away."
//
// No result dictionaries. No maps stitched in TypeScript. No return-shape or
// param spreading. A view is ONE SQL read parsed by its contract (rulings
// 71/73); a decision lives in `rules.ts`; a service passes named contract
// types through. When a shape has to be built, it is built by the database.
//
// Population: every non-test .ts file under the domain dirs that is not a
// transport file (routes/controller) and not `rules.ts` - a lookup table that
// IS a business rule (a status ladder, a carrier code map) belongs in rules.ts
// or in a table, and rules.ts is where it is allowed to be written down.
//
// Run `node scripts/lint-no-dictionaries.ts --report` to print the census
// without failing, and `--self-test` to prove the detector still detects.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { domainDirs, isTransportFile } from "./lib/layout.ts";

const ROOT = process.env.LINT_NO_DICTIONARIES_ROOT
  ? path.resolve(process.env.LINT_NO_DICTIONARIES_ROOT)
  : path.resolve(import.meta.dirname, "..");

const REPORT = process.argv.includes("--report");
const SYNTHETIC = Boolean(process.env.LINT_NO_DICTIONARIES_ROOT);

// Every entry carries the one line that justifies it. The count is pinned both
// ways: a new dictionary in an accepted file fails, and a fixed one forces the
// entry out.
const ACCEPTED: Record<string, { count: number; why: string }> = {
  "identity/auth/anonymous.ts": {
    count: 2,
    why: "better-auth's own plugin contract - the { data: user } hook shape and the plugin object are the library's, not ours",
  },
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === "tests" || e === "sql") continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts") && !e.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead: string) => lead);
}

function closingOf(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lastArgOf(src: string, openParen: number): string {
  const close = closingOf(src, openParen);
  if (close === -1) return "";
  const body = src.slice(openParen + 1, close);
  let depth = 0;
  let current = "";
  const parts: string[] = [];
  for (const c of body) {
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") depth -= 1;
    if (c === "," && depth === 0) { parts.push(current); current = ""; }
    else current += c;
  }
  parts.push(current);
  return (parts.at(-1) ?? "").trim();
}

type Finding = { file: string; line: number; what: string };

const DICT = "a dictionary built in TypeScript - the shape is one SQL read parsed by its contract (ruling 78)";

function findingsIn(rel: string, raw: string): Finding[] {
  const src = withoutComments(raw);
  const out: Finding[] = [];
  const at = (i: number) => src.slice(0, i).split("\n").length;
  const add = (i: number, what: string) => out.push({ file: rel, line: at(i), what });

  for (const m of src.matchAll(/\bnew\s+(?:Weak)?Map\s*[<(]/g)) {
    add(m.index ?? 0, `new Map stitched from rows - ${DICT}`);
  }

  for (const m of src.matchAll(/(?<!\bnew\s)\b(?:Readonly|Weak)?Map\s*</g)) {
    add(m.index ?? 0, `a Map type in a signature - pass the rows and read one with .find (ruling 78)`);
  }

  for (const m of src.matchAll(/\bObject\.fromEntries\s*\(/g)) {
    add(m.index ?? 0, `Object.fromEntries rebuilds an object - ${DICT}`);
  }

  for (const m of src.matchAll(/\bObject\.(entries|keys)\s*\([^;]*?\)\s*\.\s*(map|flatMap|reduce)\s*\(/g)) {
    add(m.index ?? 0, `Object.${m[1]} fed into .${m[2]} rebuilds an object - ${DICT}`);
  }

  for (const m of src.matchAll(/\.reduce\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const seed = lastArgOf(src, open);
    if (/^(\{|new\s+(?:Weak)?Map\s*[<(])/.test(seed)) {
      add(m.index ?? 0, `.reduce onto an ${seed.startsWith("{") ? "object" : "map"} accumulator - ${DICT}`);
    }
  }

  const INDEX = String.raw`(?:Record\s*<|\{\s*\[\s*\w+\s*:\s*(?:string|number)\s*\]\s*:)`;
  for (const m of src.matchAll(new RegExp(String.raw`(extends\s+)?${INDEX}`, "g"))) {
    if (m[1]) continue; // a generic bound is a structural constraint, not a result shape
    add(m.index ?? 0, `an index-signature type - a declared result is a named contract type, not a dictionary (ruling 78)`);
  }

  for (const m of src.matchAll(/\{[^{}]*?\.\.\.([A-Za-z_$][\w$]*)\s*[,}]/g)) {
    add(m.index ?? 0, `\`...${m[1]}\` spreads a row into an object - name the columns in SQL, not the spread (ruling 78)`);
  }

  for (const m of src.matchAll(/\(\s*\{[^(){}]*\}\s*:\s*\{/g)) {
    add(m.index ?? 0, `a parameter object destructured from an inline type - take a named contract type (ruling 73)`);
  }

  return out;
}

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const LOW = { LINT_NO_DICTIONARIES_FLOOR: "1" };
  const manifest = {
    "package.json": JSON.stringify({ imports: { "#widgets/*": "./widgets/*" } }),
  };
  const clean =
    "export async function view(id: string): Promise<WidgetView> {\n" +
    "  return await widgets.view(id);\n" +
    "}\n";
  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a Map stitched from rows is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "const byId = new Map(rows.map((r) => [r.id, r]));\n" },
        expect: "fail", mustPrint: "new Map stitched from rows",
      },
      {
        name: "a Map type in a signature is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "function f(p: ReadonlyMap<string, number>) { return p; }\n" },
        expect: "fail", mustPrint: "a Map type in a signature",
      },
      {
        name: "Object.fromEntries is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "const c = Object.fromEntries(cols.map((k) => [k, null]));\n" },
        expect: "fail", mustPrint: "Object.fromEntries",
      },
      {
        name: "Object.entries fed into .map is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "const c = Object.entries(row).map(([k, v]) => [k, v]);\n" },
        expect: "fail", mustPrint: "fed into .map",
      },
      {
        name: "Object.keys counted rather than rebuilt is not a dictionary",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": clean + "const n = Object.keys(patch).length;\n" },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a .reduce onto an object accumulator is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "const t = rows.reduce((acc, r) => acc, {});\n" },
        expect: "fail", mustPrint: "object accumulator",
      },
      {
        name: "a .reduce onto a number is arithmetic, not a dictionary",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": clean + "const t = rows.reduce((a, r) => a + r.n, 0);\n" },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a Record<> result type is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "export const FEES: Record<string, number> = { WIRE: 20 };\n" },
        expect: "fail", mustPrint: "an index-signature type",
      },
      {
        name: "an index signature is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "type Bag = { [k: string]: number };\n" },
        expect: "fail", mustPrint: "an index-signature type",
      },
      {
        name: "a spread of a row into an object is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "export function f() {\n  return { ...row, extra: 1 };\n}\n" },
        expect: "fail", mustPrint: "spreads a row into an object",
      },
      {
        name: "a spread into a call argument is seen too",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "await repo.update(id, { order_id, ...changes }, tx);\n" },
        expect: "fail", mustPrint: "spreads a row into an object",
      },
      {
        name: "a parameter object destructured from an inline type is seen",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "function f({ a, b }: { a: string; b: number }) { return a + b; }\n" },
        expect: "fail", mustPrint: "destructured from an inline type",
      },
      {
        name: "a service that passes a contract type through passes",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": clean },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "rules.ts may hold the lookup that IS the rule",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": clean, "widgets/rules.ts": "const LADDER = new Map([[\"a\", 1]]);\n" },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a transport file is not in the population",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": clean, "widgets/controller.ts": "const byId = new Map(rows.map((r) => [r.id, r]));\n" },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "a dictionary in a comment is not code",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW,
        files: { ...manifest, "widgets/service.ts": "// it used to be new Map(rows)\n" + clean },
        expect: "pass", mustPrint: "0 unaccepted",
      },
      {
        name: "--report prints the census and does not fail",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT", env: LOW, args: ["--report"],
        files: { ...manifest, "widgets/service.ts": "const byId = new Map(rows.map((r) => [r.id, r]));\n" },
        expect: "pass", mustPrint: "report only",
      },
      {
        name: "a walk that finds nothing is BROKEN, not clean",
        rootEnv: "LINT_NO_DICTIONARIES_ROOT",
        files: { ...manifest, "README.md": "no typescript here\n" },
        expect: "fail", mustPrint: "SCAN IS BROKEN",
      },
    ],
  });
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const files = domainDirs(ROOT)
  .flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => !isTransportFile(rel(f)) && path.basename(f) !== "rules.ts");

const FLOOR = Number(process.env.LINT_NO_DICTIONARIES_FLOOR ?? 72);
if (files.length < FLOOR) {
  console.error(
    `\nSCAN IS BROKEN: ${files.length} file(s) under ${domainDirs(ROOT).join(", ")}, ` +
      `expected at least ${FLOOR}. The walk broke, not the tree shrank.`
  );
  process.exit(1);
}

const byFile = new Map<string, Finding[]>();
for (const f of files) {
  const found = findingsIn(rel(f), readFileSync(f, "utf8"));
  if (found.length) byFile.set(rel(f), found);
}

const problems: Finding[] = [];
const acceptedHit = new Map<string, number>();
for (const [name, found] of [...byFile].sort()) {
  const entry = SYNTHETIC ? undefined : ACCEPTED[name];
  if (!entry) { problems.push(...found); continue; }
  acceptedHit.set(name, found.length);
}

console.log(`${files.length} file(s) scanned under ${domainDirs(ROOT).map((d) => `${d}/`).join(", ")}`);
for (const p of problems) console.log(`  DICT  ${p.file}:${p.line}  ${p.what}`);
console.log(
  `\n${problems.length} unaccepted finding(s) in ${new Set(problems.map((p) => p.file)).size} ` +
    `file(s), ${acceptedHit.size} accepted file(s)`
);
for (const [name, entry] of Object.entries(ACCEPTED)) {
  console.log(`  accepted  ${name}  ${acceptedHit.get(name) ?? 0}/${entry.count}\n            ${entry.why}`);
}

if (REPORT) {
  console.log("\nreport only - no exit code");
  process.exit(0);
}

if (!SYNTHETIC) {
  const wrong = Object.entries(ACCEPTED).filter(
    ([name, entry]) => (acceptedHit.get(name) ?? 0) !== entry.count
  );
  for (const [name, entry] of wrong) {
    console.error(
      `\nACCEPTED ${name}: ${acceptedHit.get(name) ?? 0} finding(s) found, ${entry.count} pinned`
    );
  }
  if (wrong.length) {
    console.error("update the count, or remove the entry - it can only shrink");
    process.exit(1);
  }
}

if (problems.length) {
  console.error(
    `\nno-dictionaries failed. Ruling 78: rewrite from the inputs inward - the shape\n` +
      `comes from ONE SQL read parsed by its contract, the decision lives in rules.ts,\n` +
      `and the service passes the named contract type through.`
  );
  process.exit(1);
}

console.log("no-dictionaries passed");
