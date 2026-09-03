import "#env";
import pg from "pg";

const { Pool, types } = pg;

// An unset DATABASE_URL falls back silently to PG* env vars — pg connects to a different database rather than failing.
// Refused everywhere except production (asymmetric on purpose: production's resolution already works, so refusing there could only break a working site).
export function refusesUnsetDatabaseUrl(env: {
  DATABASE_URL?: string;
  NODE_ENV?: string;
}): boolean {
  return !env.DATABASE_URL && env.NODE_ENV !== "production";
}

if (refusesUnsetDatabaseUrl(process.env)) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
      "Refusing rather than letting pg fall back to PGHOST/PGUSER/PGDATABASE, " +
      "which would open a working connection to a different database.\n" +
      "env.js composes it from DORADO_USER, DORADO_PASSWORD and PGHOST - one " +
      "of those is missing from api/.env."
  );
}

// NUMERIC arrives from pg as a string (not every value fits a JS float); every price/premium/weight column is NUMERIC, so without this `price + fee` would concatenate instead of add.
// Registered here, not in server.ts, so anything using the pool directly (scripts, migrations, cron, tests) gets numbers too.
types.setTypeParser(types.builtins.NUMERIC, (value: string) =>
  value === null ? null : parseFloat(value)
);

// BIGINT arrives as a string (int8 exceeds a safe JS number); the only int8 columns are order-number sequences, far below 2^53, so parsing to Number is safe here.
types.setTypeParser(types.builtins.INT8, (value: string) =>
  value === null ? null : Number(value)
);

// ssl.rejectUnauthorized is false — managed Postgres commonly serves a self-signed cert; left unchanged (see FOLLOWUPS.md).
// TLS is skipped only for a loopback host (127.0.0.1/::1/localhost) — Railway and any networked host still use TLS; a local Postgres has none to negotiate.
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const isLoopback = (() => {
  try {
    const h = new URL(DATABASE_URL).hostname.replace(/^\[|\]$/g, "");
    return h === "127.0.0.1" || h === "::1" || h === "localhost";
  } catch {
    // An unparseable URL is not a loopback claim. Keep TLS.
    return false;
  }
})();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ...(isLoopback ? {} : { ssl: { rejectUnauthorized: false } }),
});

export default pool;
