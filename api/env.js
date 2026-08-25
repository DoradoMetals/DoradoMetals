// Loads api/.env, wherever the process was started from.
//
// `import "dotenv/config"` reads .env relative to the current working
// directory, which quietly made the working directory decide which database a
// script talks to. There is a .env at the repo root as well as this one, and
// they point at different databases - the root at prod, this at
// dev - so `node api/scripts/compare-tables.mjs` run from the repo
// root connected to production and reported the new schema as missing, while
// the same command run from api/ worked. A confusing read was the harmless
// version of that; the runner applying 27 migrations to the wrong database was
// the other one.
//
// Resolving from this file's own location instead removes the choice. Real
// environment variables still win, so a deployed container that sets
// DATABASE_URL directly is unaffected - there is no .env there to find.
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(import.meta.dirname, ".env") });
