// Loads api/.env, wherever the process was started from, and composes the
// connection URLs from their parts.
//
// WHY IT RESOLVES FROM THIS FILE'S LOCATION. `import "dotenv/config"` reads
// .env relative to the current working directory, which quietly made the
// working directory decide which database a script talks to. There is a .env at
// the repo root as well as this one, and they point at different databases - the
// root at prod, this at dev - so `node api/scripts/compare-tables.mjs` run from
// the repo root connected to production and reported the new schema as missing,
// while the same command run from api/ worked. A confusing read was the harmless
// version of that; the runner applying 27 migrations to the wrong database was
// the other one.
//
// Resolving from this file's own location instead removes the choice. Real
// environment variables still win, so a deployed container that sets
// DATABASE_URL directly is unaffected - there is no .env there to find.
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(import.meta.dirname, ".env") });

// COMPOSING THE URLS FROM PARTS, RATHER THAN WRITING FIVE OF THEM OUT.
//
// Five full connection strings meant the same password appeared five times, and
// the host and port five times. Two real bugs came out of that within a day:
//
//   DATABASE_URL=postgresql://w:...          the username was a stray "w",
//                                            so dev stopped authenticating
//   REFRESH_ADMIN_DATABASE_URL=DATABASE_URL=postgresql://...
//                                            a doubled variable name, so the
//                                            value would not even parse
//
// Neither is possible when the username is written once and the URL is built.
// Rotating a password becomes one edit instead of five-and-hope, which matters
// here because these credentials have had to be rotated already.
//
// THE PARTS. A host and port shared by everything, then one credential per
// ROLE - not per database, because the roles are the thing that differ:
//
//   PGHOST, PGPORT
//   DORADO_USER / DORADO_PASSWORD          the application and migrations
//   READONLY_USER / READONLY_PASSWORD      audits against production
//
// AN EXPLICIT URL ALWAYS WINS. Each is only composed if it is not already set,
// so Railway injecting DATABASE_URL, or a one-off `DATABASE_URL=... node ...`,
// behaves exactly as before. That also means this can be adopted one variable
// at a time rather than in a single sweep.
const compose = (user, password, database) => {
  if (!user || !password || !process.env.PGHOST) return undefined;
  const url = new URL(`postgresql://${process.env.PGHOST}`);
  if (process.env.PGPORT) url.port = process.env.PGPORT;
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  url.pathname = `/${database}`;
  return url.toString();
};

const dorado = (database) =>
  compose(process.env.DORADO_USER, process.env.DORADO_PASSWORD, database);
const readonly = (database) =>
  compose(process.env.READONLY_USER, process.env.READONLY_PASSWORD, database);

// The database each name points at. Written here rather than in .env so that
// "which database is DATABASE_URL" is answered by reading code, not by trusting
// that five strings were all edited consistently.
const COMPOSED = {
  DATABASE_URL: () => dorado(process.env.DEV_DATABASE ?? "dev"),
  TEST_DATABASE_URL: () => dorado(process.env.TEST_DATABASE ?? "test"),
  DUMP_SOURCE_DATABASE_URL: () => dorado(process.env.PROD_DATABASE ?? "prod"),
  BACKUP_SOURCE_DATABASE_URL: () => dorado(process.env.PROD_DATABASE ?? "prod"),
  PROD_READONLY_DATABASE_URL: () => readonly(process.env.PROD_DATABASE ?? "prod"),
  // The admin connection for refresh-from-backup: any database other than the
  // one being dropped, which is why it is the maintenance database.
  REFRESH_ADMIN_DATABASE_URL: () => dorado("postgres"),
};

for (const [name, build] of Object.entries(COMPOSED)) {
  if (process.env[name]) continue;
  const url = build();
  if (url) process.env[name] = url;
}

// ONE SWITCH TO RUN THE SUITE AGAINST `test` INSTEAD OF `dev`.
//
// AFTER the composition loop, deliberately: TEST_DATABASE_URL may be composed
// rather than written out, and reading it first threw "not set" for anyone
// using the composed form. Written the wrong way round the first time.
//
// The tests read DATABASE_URL like everything else, so pointing them elsewhere
// has always been possible - this just makes it one flag instead of remembering
// to export the right variable, and puts the reason in one place.
//
// NOT USABLE YET, and the reason is worth knowing before you try it. `test` is
// rebuilt from a production backup, and production has no leads, rates,
// reviews, products, metals or media schema at all. The migrations create them
// and, today, leave them empty - so every repo.next test would read zero rows
// and fail. This becomes usable the moment the migration chain populates the
// new schemas on a production-shaped database, which is the same blocker as
// promotion.
//
//   USE_TEST_DB=1 pnpm --filter @dorado/api test
//   pnpm --filter @dorado/api test:on-test-db
//
// It refuses to point at anything but the test database, so it cannot become a
// way to run a suite that writes against dev or prod by accident.
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
