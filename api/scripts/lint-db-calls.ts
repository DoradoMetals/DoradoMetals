import fs from "node:fs";
import path from "node:path";
import { domainDirs } from "./lib/layout.ts";

const ROOT = process.env.LINT_DB_ROOT
  ? path.resolve(process.env.LINT_DB_ROOT)
  : path.resolve(import.meta.dirname, "..");

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./lib/self-test-harness.ts");
  const clean = `import query from "#shared/db/query.ts";
export async function getOne(id, client) {
  const { rows } = await query("SELECT 1", [id], client);
  return rows[0];
}`;
  const LOW = { LINT_DB_FILE_FLOOR: "0", LINT_DB_CALL_FLOOR: "0" };
  const with_ = (extra: string) => ({
    "package.json": JSON.stringify({ imports: { "#things/*": "./things/*" } }),
    "db/thing/repo.exchange.js": clean + "\n" + extra,
  });
  await selfTest({
    script: import.meta.filename,
    cases: [
      {
        name: "pool.query bypassing the shared executor is seen",
        rootEnv: "LINT_DB_ROOT",
        env: LOW,
        files: with_(`export const bad = async () => await pool.query("SELECT 1");`),
        expect: "fail",
        mustPrint: "bypasses the shared executor",
      },
      {
        name: "an executor passed in the params slot is seen",
        rootEnv: "LINT_DB_ROOT",
        env: LOW,
        files: with_(`export const bad = async (client) => await query("SELECT 1", client);`),
        expect: "fail",
        mustPrint: "executor passed as params",
      },
      {
        name: "an unawaited query is seen",
        rootEnv: "LINT_DB_ROOT",
        env: LOW,
        files: with_(`export const bad = () => { const r = query("SELECT 1", []); return r.rows; };`),
        expect: "fail",
        mustPrint: "never awaited",
      },
      {
        name: "a clean tree passes",
        rootEnv: "LINT_DB_ROOT",
        env: LOW,
        files: with_(""),
        expect: "pass",
        mustPrint: "db call check passed",
      },
      {
        name: "the floor itself fires on a tree far below it",
        rootEnv: "LINT_DB_ROOT",
        files: with_(""),
        expect: "fail",
        mustPrint: "A smaller number is not a cleaner codebase",
      },
    ],
  });
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function callArgs(src: string, open: number): { args: string[]; end: number } {
  const args: string[] = [];
  let depth = 1;
  let cur = "";
  let i = open + 1;

  for (; i < src.length && depth > 0; i++) {
    const c = src[i];

    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      cur += src.slice(i, j + 1);
      i = j;
      continue;
    }

    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) break;
    }

    if (depth === 1 && c === ",") {
      args.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }

  args.push(cur);
  return { args: args.map((a) => a.trim()), end: i };
}

const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

const problems: string[] = [];

let filesScanned = 0;
let callsChecked = 0;

const LAYER_ROOTS = ["db", ...domainDirs(ROOT)];
const existingRoots = LAYER_ROOTS.filter((l) => fs.existsSync(path.join(ROOT, l)));
if (!existingRoots.length) {
  console.error(
    `lint:db cannot read any of ${LAYER_ROOTS.map((l) => path.join(ROOT, l)).join(", ")} - ` +
      `the walk is broken, not the codebase clean`
  );
  process.exit(1);
}

for (const file of existingRoots.flatMap((l) => sourceFiles(path.join(ROOT, l)))) {
  const src = fs.readFileSync(file, "utf8");
  filesScanned++;
  const rel = path.relative(ROOT, file);
  for (const m of src.matchAll(/\bpool\.query\(/g)) {
    problems.push(
      `${rel}:${lineOf(src, m.index)}  pool.query bypasses the shared executor - use query(sql, params, client)`
    );
  }

  const re = /\bquery\(/g;
  let m;

  while ((m = re.exec(src))) {
    if (src[m.index - 1] === ".") continue;
    if (/function\s+$/.test(src.slice(0, m.index))) continue;

    callsChecked++;
    const open = m.index + "query".length;
    const { args } = callArgs(src, open);
    const line = lineOf(src, m.index);

    if (args.length === 2 && /^(client|executor)$/.test(args[1])) {
      problems.push(
        `${rel}:${line}  executor passed as params - use query(sql, [], ${args[1]})`
      );
    }

    const before = src.slice(0, m.index).trimEnd();
    const awaited = /\bawait$/.test(before);
    const returned = /\breturn$/.test(before);
    if (!awaited && !returned) {
      problems.push(`${rel}:${line}  query() result is never awaited`);
    }
  }
}

const FILE_FLOOR = process.env.LINT_DB_ROOT ? Number(process.env.LINT_DB_FILE_FLOOR ?? 407) : 407;
const CALL_FLOOR = process.env.LINT_DB_ROOT ? Number(process.env.LINT_DB_CALL_FLOOR ?? 60) : 60;
if (filesScanned < FILE_FLOOR || callsChecked < CALL_FLOOR) {
  console.error(
    `lint:db walked ${filesScanned} file(s) and checked ${callsChecked} query() call(s), ` +
      `expected at least ${FILE_FLOOR} and ${CALL_FLOOR} - the walk or the call parser ` +
      `has broken. A smaller number is not a cleaner codebase.`
  );
  process.exit(1);
}

if (problems.length) {
  console.error(`db call check failed (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log(
  `db call check passed (${callsChecked} query() call(s) in ${filesScanned} file(s))`
);
