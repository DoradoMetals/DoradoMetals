// Loads api/.env relative to THIS FILE, not the working directory — `dotenv/config`'s cwd-relative load let a script run from the repo root (whose own .env points at PRODUCTION) silently connect to the wrong database; one incident applied 27 migrations there.
// Real environment variables still win, so a deployed container setting DATABASE_URL directly is unaffected.
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

// quiet: dotenv 17 prints an "injected env" tip banner per process by default,
// which under `node --test` means once per test file.
dotenv.config({ path: path.join(import.meta.dirname, ".env"), quiet: true });

// Composed from parts rather than five full connection strings — duplicating the password/host/port five times produced two real bugs in a day (a stray username, a doubled variable that wouldn't even parse). Rotating a password is now one edit, which matters since these credentials have had to be rotated already.
//
// One credential per ROLE, not per database — DORADO_USER/PASSWORD for the app and migrations, READONLY_USER/PASSWORD for production audits, sharing PGHOST/PGPORT.
//
// Only composed if not already set — an explicit DATABASE_URL (Railway, or a one-off override) always wins, and adoption can happen one variable at a time.
const compose = (
  user: string | undefined,
  password: string | undefined,
  database: string
): string | undefined => {
  if (!user || !password || !process.env.PGHOST) return undefined;
  const url = new URL(`postgresql://${process.env.PGHOST}`);
  if (process.env.PGPORT) url.port = process.env.PGPORT;
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  url.pathname = `/${database}`;
  return url.toString();
};

const dorado = (database: string) =>
  compose(process.env.DORADO_USER, process.env.DORADO_PASSWORD, database);
const readonly = (database: string) =>
  compose(process.env.READONLY_USER, process.env.READONLY_PASSWORD, database);

// Local-cluster only — the remote Railway `test` (rebuilt from a production
// archive, missing eight schemas) is never branch-derived. A stray git
// command should not change what dev/prod tooling means by "the test
// database" when nobody asked for per-branch behaviour there.
const isLoopbackHost = (url: string): boolean => {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return h === "127.0.0.1" || h === "::1" || h === "localhost";
  } catch {
    return false;
  }
};

// One test database per worktree/branch (FOLLOWUPS D214 item 9, the lesson
// appended 2026-09-03): every worktree's preflight used to auto-migrate the
// SAME shared local `test` database, so a migration written in one lane
// changed the schema under every other lane's gate at the same time. This
// derives `test_<branch>` for any worktree other than the main checkout (the
// main checkout, and the `api-hardening` branch specifically, keep plain
// `test`); `preflight-test-db.ts` creates the database with
// `CREATE DATABASE ... TEMPLATE test` on first use. `git` failing (not
// installed, detached HEAD) falls back to `null`, which leaves
// TEST_DATABASE_URL exactly as `.env` set it — the existing, already-safe
// behaviour.
const deriveTestDatabaseName = (testUrl: string): string | null => {
  if (!isLoopbackHost(testUrl)) return null;
  try {
    const run = (cmd: string) =>
      execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const branch = run("git branch --show-current");
    if (!branch || branch === "api-hardening") return "test";
    const gitDir = path.resolve(run("git rev-parse --git-dir"));
    const commonDir = path.resolve(run("git rev-parse --git-common-dir"));
    if (gitDir === commonDir) return "test"; // the main checkout, whatever branch
    const sanitised = branch
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `test_${sanitised}`;
  } catch {
    return null;
  }
};

// The database each name points at. Written here rather than in .env so that
// "which database is DATABASE_URL" is answered by reading code, not by trusting
// that five strings were all edited consistently.
const COMPOSED: Record<string, () => string | undefined> = {
  DATABASE_URL: () => dorado(process.env.DEV_DATABASE ?? "dev"),
  TEST_DATABASE_URL: () => dorado(process.env.TEST_DATABASE ?? "test"),
  DUMP_SOURCE_DATABASE_URL: () => dorado(process.env.PROD_DATABASE ?? "prod"),
  BACKUP_SOURCE_DATABASE_URL: () => dorado(process.env.PROD_DATABASE ?? "prod"),
  PROD_READONLY_DATABASE_URL: () => readonly(process.env.PROD_DATABASE ?? "prod"),
  // The admin connection for refresh-from-backup: any database other than the one being dropped, which is why it is the maintenance database.
  REFRESH_ADMIN_DATABASE_URL: () => dorado("postgres"),
};

for (const [name, build] of Object.entries(COMPOSED)) {
  if (process.env[name]) continue;
  const url = build();
  if (url) process.env[name] = url;
}

// USE_TEST_DB=1 points the suite at TEST_DATABASE_URL instead of DATABASE_URL — checked AFTER the composition loop above (composing first, then reading, was backwards the first time and threw "not set").
// Default since 2026-09-03: `pnpm test` sets this against a LOCAL Postgres provisioned from dev — not the remote Railway `test`, which is rebuilt from a PRODUCTION backup missing several schemas entirely (leads, rates, reviews, products, metals, media), so tests reading them would see zero rows.
// Refuses outright if TEST_DATABASE_URL doesn't resolve to the actual test database — so this can't become a way to run the suite against dev or prod by accident.
if (process.env.USE_TEST_DB === "1") {
  let testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("USE_TEST_DB=1 but TEST_DATABASE_URL is not set");
  }

  // Per-branch test database — see deriveTestDatabaseName above. Skipped when
  // TEST_DATABASE is already set: vitest.config.ts imports this module once,
  // in its own process, then hands the resolved TEST_DATABASE_URL/TEST_DATABASE
  // down to every forked worker via vitest's `test.env` — so the ~160 test
  // files re-importing #env (vitest's `isolate: true` resets the module
  // registry per file) find the answer already there instead of re-running
  // `git` once per file.
  if (!process.env.TEST_DATABASE) {
    const derived = deriveTestDatabaseName(testUrl);
    if (derived) {
      const u = new URL(testUrl);
      if (u.pathname !== `/${derived}`) {
        u.pathname = `/${derived}`;
        testUrl = u.toString();
        process.env.TEST_DATABASE_URL = testUrl;
      }
      process.env.TEST_DATABASE = derived;
    }
  }

  const name = (() => {
    try {
      return decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ""));
    } catch {
      return "";
    }
  })();
  if (name !== (process.env.TEST_DATABASE ?? "test")) {
    throw new Error(
      `USE_TEST_DB=1 but TEST_DATABASE_URL points at "${name}", not the test ` +
        `database. Refusing rather than running a suite against it.`
    );
  }
  process.env.DATABASE_URL = testUrl;
}
