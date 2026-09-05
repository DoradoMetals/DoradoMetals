import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.LINT_NO_MINTED_IDS_ROOT
  ? path.resolve(process.env.LINT_NO_MINTED_IDS_ROOT)
  : path.join(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const repo =
    "export async function create(row, executor) {\n" +
    "  return { id: row.id ?? \"generated\", name: row.name };\n" +
    "}\n";

  await selfTest({
    script: new URL(import.meta.url).pathname,
    cases: [
      {
        name: "a randomUUID call outside tests is seen",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts":
            "import { randomUUID } from \"node:crypto\";\n" +
            "export const id = randomUUID();\n",
        },
        expect: "fail", mustPrint: "randomUUID",
      },
      {
        name: "crypto.randomUUID() is seen the same way",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts": "import crypto from \"node:crypto\";\nconst id = crypto.randomUUID();\n",
        },
        expect: "fail", mustPrint: "randomUUID",
      },
      {
        name: "a uuid package import is seen",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts": "import { v4 } from \"uuid\";\nconst id = v4();\n",
        },
        expect: "fail", mustPrint: "uuid",
      },
      {
        name: "an id: key passed to a repo create is seen",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts":
            "import * as x from \"#db/x/repo.ts\";\n" +
            "export const made = await x.create({ id: \"minted\", name: \"a\" }, tx);\n",
        },
        expect: "fail", mustPrint: "x/service.ts",
      },
      {
        name: "an id: key reaching create through the #db barrel is still seen",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/index.ts": "export * as x from \"#db/x/repo.ts\";\n",
          "db/x/repo.ts": repo,
          "x/service.ts":
            "import { x } from \"#db\";\n" +
            "export const made = await x.create({ id: \"minted\", name: \"a\" }, tx);\n",
        },
        expect: "fail", mustPrint: "x/service.ts",
      },
      {
        name: "an id: key spread across several lines is still seen",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts":
            "import * as x from \"#db/x/repo.ts\";\n" +
            "export const made = await x.create(\n" +
            "  {\n    id: \"minted\",\n    name: \"a\",\n  },\n  tx\n" +
            ");\n",
        },
        expect: "fail", mustPrint: "x/service.ts",
      },
      {
        name: "a create call naming only foreign-key _id columns passes",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts":
            "import * as x from \"#db/x/repo.ts\";\n" +
            "export const made = await x.create({ order_id: id, method_id: m }, tx);\n",
        },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "randomUUID inside shared/testing is not a finding",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "shared/testing/builders/x.ts":
            "import { randomUUID } from \"node:crypto\";\nexport const id = randomUUID();\n",
        },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "randomUUID inside a tests directory is not a finding",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/tests/service.test.ts":
            "import { randomUUID } from \"node:crypto\";\nconst id = randomUUID();\n",
        },
        expect: "pass", mustPrint: "0 finding",
      },
      {
        name: "an id: key on a plain object that is not a repo create passes",
        rootEnv: "LINT_NO_MINTED_IDS_ROOT",
        files: {
          "db/x/repo.ts": repo,
          "x/service.ts": "export const shape = { id: \"not a repo call\", name: \"a\" };\n",
        },
        expect: "pass", mustPrint: "0 finding",
      },
    ],
  });
}

const SYNTHETIC = Boolean(process.env.LINT_NO_MINTED_IDS_ROOT);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "migrations", "scripts", "sandbox", "tests-external", "tests",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const full = path.join(dir, e);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

const allFiles = walk(ROOT).filter((f) => /\.(ts|mjs|js)$/.test(f) && !f.endsWith(".d.ts"));

const FLOOR = Number(process.env.LINT_NO_MINTED_IDS_FLOOR ?? 200);
if (!SYNTHETIC && allFiles.length < FLOOR) {
  console.error(
    `lint:no-minted-ids scanned ${allFiles.length} file(s), fewer than the ${FLOOR} api/ ` +
      "actually holds outside migrations/scripts/sandbox/tests-external. The walk broke, " +
      "not the tree shrank."
  );
  process.exit(1);
}

const eligibleFiles = allFiles.filter((f) => {
  const r = rel(f);
  if (r.startsWith("shared/testing/")) return false;
  if (r.includes("/tests/")) return false;
  if (/\.test\.(ts|mjs|js)$/.test(r)) return false;
  return true;
});

type Finding = { file: string; line: number; what: string };
const mintFindings: Finding[] = [];

const RANDOM_UUID = /\brandomUUID\s*\(/g;
const UUID_IMPORT = /from\s*["']uuid["']|require\(\s*["']uuid["']\s*\)/g;

for (const f of eligibleFiles) {
  const src = readFileSync(f, "utf8");
  const r = rel(f);
  for (const m of src.matchAll(RANDOM_UUID)) {
    mintFindings.push({
      file: r, line: lineOf(src, m.index ?? 0),
      what: "randomUUID() - the database mints ids, not application code (ruling 72)",
    });
  }
  for (const m of src.matchAll(UUID_IMPORT)) {
    mintFindings.push({
      file: r, line: lineOf(src, m.index ?? 0),
      what: "an import of the uuid package - the database mints ids, not application code (ruling 72)",
    });
  }
}

const repoFiles = allFiles.filter((f) => /repo(\.\w+)?\.(ts|js)$/.test(f));
const createFnsByFile = new Map<string, Set<string>>();
for (const f of repoFiles) {
  const src = readFileSync(f, "utf8");
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+async\s+function\s+(create\w*)\s*\(/g)) names.add(m[1]!);
  if (names.size) createFnsByFile.set(rel(f), names);
}

const BARREL = new Map<string, string>();
try {
  const barrel = readFileSync(path.join(ROOT, "db", "index.ts"), "utf8");
  for (const m of barrel.matchAll(/export\s+\*\s+as\s+(\w+)\s+from\s+["']#db\/([^"']+)["']/g)) {
    BARREL.set(m[1]!, `db/${m[2]!}`);
  }
} catch {   }

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (/^#[^/]+\//.test(spec)) return spec.slice(1);
  if (spec.startsWith(".")) return path.normalize(path.join(path.dirname(fromFile), spec));
  return null;
}

function extractArgs(src: string, openParenIndex: number): { text: string; end: number } {
  let depth = 0;
  let i = openParenIndex + 1;
  let inStr: string | null = null;
  const start = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  return { text: src.slice(start, i), end: i };
}

const ACCEPTED: Record<string, string> = {
  "payments/service.ts::attempts.create":
    "reuses its intent's already-assigned id as this attempt's own primary key - a " +
    "deliberate shared-key extension row, not a fresh mint. Every other caller still " +
    "gets DEFAULT gen_random_uuid() from payments.attempts.id.",
};
const acceptedHit = new Set<string>();

for (const f of eligibleFiles) {
  const src = readFileSync(f, "utf8");
  const r = rel(f);

  const ns2file = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+(\w+)|(\w+))\s+from\s+["']([^"']+)["']/g)) {
    const alias = (m[1] ?? m[2])!;
    const target = resolveSpecifier(r, m[3]!);
    if (target) ns2file.set(alias, target);
  }
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']#db["']/g)) {
    for (const entry of m[1]!.split(",")) {
      const [name, alias] = entry.trim().split(/\s+as\s+/);
      const target = BARREL.get((name ?? "").trim());
      if (target) ns2file.set((alias ?? name)!.trim(), target);
    }
  }

  for (const m of src.matchAll(/\b(\w+)\.(create\w*)\s*\(/g)) {
    const [, ns, name] = m as unknown as [string, string, string];
    const target = ns2file.get(ns);
    if (!target) continue;
    const names = createFnsByFile.get(target);
    if (!names?.has(name)) continue;

    const openParen = (m.index ?? 0) + m[0].length - 1;
    const { text } = extractArgs(src, openParen);
    if (!/\bid\s*:/.test(text)) continue;

    const key = `${r}::${ns}.${name}`;
    if (!SYNTHETIC && ACCEPTED[key]) { acceptedHit.add(key); continue; }
    mintFindings.push({
      file: r, line: lineOf(src, m.index ?? 0),
      what: `${ns}.${name}(...) passes an id: key - the repo's create() mints its own (ruling 72)`,
    });
  }
}

console.log(
  `${eligibleFiles.length} file(s) scanned, ${repoFiles.length} repo file(s), ` +
    `${[...createFnsByFile.values()].reduce((n, s) => n + s.size, 0)} create-shaped export(s)`
);
for (const f of mintFindings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  console.error(`  ${f.file}:${f.line}  ${f.what}`);
}
console.log(`\n${mintFindings.length} finding(s), ${acceptedHit.size} accepted`);
for (const [key, why] of Object.entries(ACCEPTED)) {
  if (acceptedHit.has(key)) console.log(`  accepted  ${key}\n            ${why}`);
}

const stale = SYNTHETIC ? [] : Object.keys(ACCEPTED).filter((k) => !acceptedHit.has(k));
if (stale.length) {
  console.error(`\n${stale.length} ACCEPTED entr(y/ies) matched nothing:`);
  for (const k of stale) console.error(`  ${k}`);
  console.error("remove them - the call they excuse is gone or has changed shape");
  process.exit(1);
}

if (mintFindings.length) {
  console.error(
    "\nlint:no-minted-ids failed. Ruling 72 (Jacob): \"The database will create ids. " +
      "WE SHOULD NEVER CREATE UUIDS ON THE API OR FRONTEND.\" Let the repo's create() " +
      "insert without an id and read it back from RETURNING *."
  );
  process.exit(1);
}

console.log("no-minted-ids passed");
