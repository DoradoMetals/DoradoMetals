// Loads api/.env relative to THIS FILE, not the working directory — `dotenv/config`'s cwd-relative load let a script run from the repo root (whose own .env points at PRODUCTION) silently connect to the wrong database; one incident applied 27 migrations there.
// Real environment variables still win, so a deployed container setting DATABASE_URL directly is unaffected.
import path from "node:path";
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
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("USE_TEST_DB=1 but TEST_DATABASE_URL is not set");
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
