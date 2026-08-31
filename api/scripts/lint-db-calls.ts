// Static checks for the two ways a call to the shared query executor has
// actually gone wrong in this repo. Both are mechanical, so they are checked
// mechanically rather than left to review.
//
//   1. Executor passed in the params slot.
//        query(sql, client)            <- client lands in `params`
//      pg then rejects with "Query values must be an array". This shipped and
//      broke checkout: a rolled-back sell-cart sync left scrap rows unwritten,
//      so order creation hit a foreign key violation.
//
//   2. Direct use of pool.query, which bypasses the shared executor. Those
//      calls cannot be handed a client, so they can never join a caller's
//      transaction - the reason several multi-step operations were not atomic.
//
//   3. A query that is never awaited.
//        const result = query(sql, values)   <- result is a Promise
//      result.rows is undefined, so the next line throws reading '0'. Silent
//      for months behind a swallowed catch.
//
// *** WHAT IT CANNOT SEE. Written down because a detector's blind spot reports
// as CLEAN (D95), and this one guards the executor that keeps a repo call inside
// its caller's transaction. ***
//   - IT WALKS features/ AND legacy/ ONLY. shared/ and providers/ are not
//     scanned. Checked at the time of writing: the only `query(`/`pool.query(`
//     outside those two are the executor itself (shared/db/query.ts), the
//     transaction helper's own BEGIN/COMMIT/ROLLBACK, and the test pool - all
//     legitimate. A repo that moved into shared/ would leave the scan silently.
//   - A CALL REACHED THROUGH ANOTHER NAME: `const q = query; q(sql, client)`,
//     or a member call `repo[name](sql, client)`. It matches the literal
//     identifier `query(`.
//   - `.query(` ON ANYTHING BUT `pool`. `client.query` is legitimate inside
//     withTransaction; a NEW long-lived handle called something else would look
//     like it.
//   - AWAIT-DETECTION IS TEXTUAL: `const p = query(...); await p;` reads as
//     unawaited (a false positive, and none exists today), and
//     `Promise.all([query(...)])` reads as awaited because `return`/`await`
//     precede the array, not the call.
//
// Run: pnpm --filter @dorado/api lint:db
//      pnpm --filter @dorado/api lint:db:self-test
import fs from "node:fs";
import path from "node:path";

// The root is overridable ONLY so the self-test can point the whole script at a
// synthetic tree and confirm it still sees a planted violation (D134). Nothing
// in the real run sets it.
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
  // Every case carries the SAME clean file plus one planted defect, so a case
  // that fails proves the defect was seen rather than that the fixture was
  // malformed. `legacy/` is present in all of them because its absence is now
  // itself a failure.
  const LOW = { LINT_DB_FILE_FLOOR: "0", LINT_DB_CALL_FLOOR: "0" };
  const with_ = (extra: string) => ({
    "features/thing/repo.exchange.js": clean + "\n" + extra,
    "legacy/keep.js": clean,
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
      {
        name: "a missing legacy/ is a broken walk, not a clean one",
        rootEnv: "LINT_DB_ROOT",
        env: LOW,
        files: { "features/thing/repo.exchange.js": clean },
        expect: "fail",
        mustPrint: "the walk is broken",
      },
    ],
  });
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  // A directory that has stopped existing is a BROKEN WALK, not an empty one.
  // `features/` or `legacy/` vanishing is exactly the shape of D120's rot:
  // walk nothing, find nothing, exit 0.
  if (!fs.existsSync(dir)) {
    console.error(`lint:db cannot read ${dir} - the walk is broken, not the codebase clean`);
    process.exit(1);
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// Splits the argument list of a call whose opening paren is at `open`,
// respecting nesting, strings and template literals.
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

// Counted, and printed on success. A check whose success message is just
// "passed" carries no evidence of what it looked at, so a walk that quietly
// stops seeing files is indistinguishable from a clean codebase - which is
// exactly how transaction-side-effects.test.js came to be scanning three files
// out of twenty-one for the whole TypeScript conversion (D40). Every other
// lint here prints its denominator; this one now does too.
let filesScanned = 0;
let callsChecked = 0;

// legacy/ IS SCANNED TOO. The dual-write mirrors moved out of features/ in
// the 26c factoring (ruling 29 - one directory to delete at promotion), and
// they are exactly the code this lint exists for: a mirror that forgets its
// executor commits while the caller rolls back.
for (const file of [
  ...sourceFiles(path.join(ROOT, "features")),
  ...sourceFiles(path.join(ROOT, "legacy")),
]) {
  const src = fs.readFileSync(file, "utf8");
  filesScanned++;
  const rel = path.relative(ROOT, file);
  // Direct pool.query bypasses the shared executor entirely.
  for (const m of src.matchAll(/\bpool\.query\(/g)) {
    problems.push(
      `${rel}:${lineOf(src, m.index)}  pool.query bypasses the shared executor - use query(sql, params, client)`
    );
  }

  const re = /\bquery\(/g;
  let m;

  while ((m = re.exec(src))) {
    // Skip property access such as client.query( or pool.query(.
    if (src[m.index - 1] === ".") continue;
    // Skip the declaration of the executor itself.
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

// FLOORS, because a report that cannot see its subject prints a smaller number
// and exits 0 while an assertion fails (D135). Both halves of the walk have to
// be checked: a matcher that stopped recognising `query(` would leave
// filesScanned intact and callsChecked at zero, and the file count alone would
// call that clean. The numbers at the time of writing are 338 files and 203
// calls; these floors are set well below so that ordinary churn does not move
// them, and a drop past them means the parser broke rather than the repo did.
//
// SELF_TEST_FLOORS is the escape: under --self-test the tree is synthetic and
// deliberately tiny, so the floors would fire on every case and every case
// would "detect" a violation that was never planted.
// The floors are lowerable ONLY in the same breath as the root override, so a
// self-test case can exercise the detector on a three-file tree - and one case
// deliberately omits the override to prove THE FLOOR ITSELF still fires. A
// floor nothing ever trips is a floor nobody has checked.
const FILE_FLOOR = process.env.LINT_DB_ROOT ? Number(process.env.LINT_DB_FILE_FLOOR ?? 200) : 200;
const CALL_FLOOR = process.env.LINT_DB_ROOT ? Number(process.env.LINT_DB_CALL_FLOOR ?? 120) : 120;
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

