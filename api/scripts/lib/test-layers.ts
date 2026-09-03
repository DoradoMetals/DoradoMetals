// Classifies every `*.test.ts` file into one of three lanes by what it
// ACTUALLY IMPORTS - not a hand-maintained list, and not by directory (the
// tree does not cleanly split that way: HTTP tests for orders, checkout,
// payments and friends live under `domain/<feature>/tests/`, not a mirrored
// `transport/` tree - `transport/` today holds zero test files of its own).
// Same idea as lint-test-locks.ts's own graph: derived from the real tree
// every run, so the split cannot rot out of sync with the source it splits.
//
//   http  - imports `supertest` to drive the real app (`#app`). The
//           heaviest lane: exercising the app also exercises the database
//           underneath it, so a file matching this check is HTTP regardless
//           of what else it imports.
//   db    - touches the database directly without going through HTTP - a
//           repo test, a service test, anything importing `#db`/`#db/*`,
//           the pinned-pool harness, or calling `withTransaction`.
//   unit  - neither. Pure functions, rules, and the static-source checks
//           (docs/waves/test-suite-redesign.md 2.2 calls these L1/L2).
//
// Exported as absolute FILE PATHS (not glob patterns), so vitest.config.ts's
// three projects can point `include` at an exact, derived set rather than a
// pattern that would have to be kept in sync by hand.
import fs from "node:fs";
import path from "node:path";

const EXCLUDED_DIRS = new Set(["node_modules", "tests-external", "sandbox", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const HTTP_SIGNAL = /from\s+["']supertest["']|require\(\s*["']supertest["']\s*\)/;
const DB_SIGNAL = /#db\/|#db["'\s.]|pinned-pool\.ts|inPinnedTransaction|withTransaction/;

export type TestLayers = {
  unit: string[];
  db: string[];
  http: string[];
  all: string[];
};

export function classifyTestFiles(root: string): TestLayers {
  const files = walk(root).sort();
  const unit: string[] = [];
  const db: string[] = [];
  const http: string[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (HTTP_SIGNAL.test(source)) http.push(file);
    else if (DB_SIGNAL.test(source)) db.push(file);
    else unit.push(file);
  }

  return { unit, db, http, all: files };
}
