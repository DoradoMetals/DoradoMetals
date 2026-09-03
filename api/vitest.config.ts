import { defineConfig } from "vitest/config";
import path from "node:path";
import "./env.ts";
import { classifyTestFiles } from "./scripts/lib/test-layers.ts";

// The runner conversion (docs/waves/test-suite-redesign.md, "Runner"/lane 3,
// FOLLOWUPS D214 item 9). Same suite, same real-Postgres-in-a-rolled-back-
// transaction harness (pinned-pool.ts, locks.ts, session.ts) - only the
// process model changes. Measured 1.9x faster and run-to-run stable, because
// `node --test` re-imports the whole `#app` module graph in a FRESH PROCESS
// per file (163 processes for 163 files), while vitest's forks pool reuses a
// small number of worker processes with a cached module graph.
const ROOT = import.meta.dirname;

// `./env.ts` above already ran (dotenv + the per-branch TEST_DATABASE_URL
// derivation - see env.ts's `deriveTestDatabaseName`), in THIS process, once.
// Handing its result down through `test.env` means every forked worker, and
// every one of the ~160 test files re-importing `#env` inside it (vitest's
// `isolate: true` resets the module registry per file), finds the answer
// already there instead of re-running `git` once per file - env.ts's own
// fast path skips re-deriving when TEST_DATABASE is already set.
const sharedEnv: Record<string, string> = {
  TZ: "UTC",
  NODE_ENV: "test",
  USE_TEST_DB: process.env.USE_TEST_DB ?? "1",
};
if (process.env.DATABASE_URL) sharedEnv.DATABASE_URL = process.env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) sharedEnv.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (process.env.TEST_DATABASE) sharedEnv.TEST_DATABASE = process.env.TEST_DATABASE;

// Subpath imports (`#env`, `#db`, `#db/*`, `#domain/*`, ...) come from
// api/package.json's own `imports` map, which Node's native ESM loader
// resolves at runtime but vite's resolver does not know about on its own -
// the redesign doc's own prototype hit this ("subpath imports resolved by
// resolve.alias"). Exact (`#env`, `#db`, `#app`) and wildcard (`#db/*`, ...)
// entries need separate, anchored regexes: `#db` and `#db/*` point at
// DIFFERENT targets (db.ts vs the db/ directory), and a plain string alias
// would prefix-match both onto the same one.
const exact = (specifier: string, target: string) => ({
  find: new RegExp(`^${specifier}$`),
  replacement: path.resolve(ROOT, target),
});
const wildcard = (prefix: string, dir: string) => ({
  find: new RegExp(`^${prefix}\\/`),
  replacement: path.resolve(ROOT, dir) + "/",
});

const alias = [
  exact("#env", "env.ts"),
  exact("#db", "db.ts"),
  exact("#app", "app.ts"),
  wildcard("#shared", "shared"),
  wildcard("#providers", "providers"),
  wildcard("#db", "db"),
  wildcard("#domain", "domain"),
  wildcard("#transport", "transport"),
];

// Classified from the real tree every run (scripts/lib/test-layers.ts), not a
// hand-maintained list - see that file's header for why the split is by
// import, not by directory. Converted to root-relative paths because vite's
// glob matcher wants those, not absolute ones.
const layers = classifyTestFiles(ROOT);
const rel = (files: string[]) => files.map((f) => path.relative(ROOT, f));

function project(name: string, files: string[]) {
  return {
    extends: true as const,
    test: {
      name,
      include: rel(files),
    },
  };
}

export default defineConfig({
  test: {
    globals: false,
    pool: "forks",
    // The closest equivalent to `node --test`'s per-file process isolation
    // that still gets vitest's reuse: each test file still runs with its own
    // fresh module registry (so one file's top-level state never leaks into
    // the next, which a brand-new process gave for free), but the OS process
    // underneath is recycled across files instead of re-spawned per file.
    // (Vitest 4 moved this out of `poolOptions.forks` to a top-level option -
    // `true` is also the default, set explicitly because it is load-bearing
    // here, not incidental.)
    isolate: true,
    setupFiles: ["./shared/testing/vitest-setup.ts"],
    env: sharedEnv,
    testTimeout: 20_000,
    // vitest's own default (10_000ms) is tight for `domain/media/pdfs/tests/
    // replay.test.ts`'s `afterAll` (`closeBrowser()`, a real Puppeteer/
    // Chromium teardown - one of the suite's slowest files even in isolation,
    // design doc 1.1) once anything else is competing for CPU - `pnpm
    // audit:test-leaks` wraps the suite in its own before/after fingerprint
    // sweep of every exchange table, and that extra load pushed the hook past
    // 10s where it never had before. Matched to testTimeout rather than
    // guessed.
    hookTimeout: 20_000,
    // Measured, not the design doc's bare default: the doc's 10.03s/10.01s
    // was one project's worth of files sharing vitest's own (CPU-derived,
    // here 24) worker cap. Running `unit`+`db`+`http` TOGETHER - what `test`
    // (no `--project` filter) does - schedules all three projects' files
    // against that SAME cap at once, which is up to 3x the concurrent forked
    // processes any single project run exercises. Every `orders.*`/
    // `refiners.*`/`checkout.*` write in this suite serializes through ONE
    // advisory lock (`LOCKS.ORDERS`, shared-testing/locks.ts), so that many
    // processes queued on it at once produced real cascading failures - hook/
    // test timeouts, and once a stale FK insert - reproducible on the
    // combined run and never on an isolated project run. Capping the worker
    // count is the fix: it bounds how many files can be mid-transaction
    // (holding a connection, maybe queued on a lock) at the same instant,
    // without touching the lock design itself. 12 (half this box's 24 CPUs)
    // was the first value tried and it held five consecutive full runs.
    maxWorkers: 12,
    exclude: ["node_modules/**", "tests-external/**", "sandbox/**"],
    projects: [
      project("unit", layers.unit),
      project("db", layers.db),
      project("http", layers.http),
    ],
    coverage: {
      provider: "v8",
      // Per-layer thresholds (docs/waves/test-suite-redesign.md 2.5) are
      // lane 7 - this only wires the provider so `--coverage` runs today.
      exclude: [
        "node_modules/**",
        "**/tests/**",
        "**/*.test.ts",
        "scripts/**",
        "tests-external/**",
        "sandbox/**",
        "migrations/**",
      ],
    },
  },
  resolve: { alias },
});
