import "#env";
import pg from "pg";

const { Pool, types } = pg;

// AN UNSET DATABASE_URL DOES NOT FAIL. IT CONNECTS SOMEWHERE ELSE.
//
// pg falls back to the PG* environment variables, and #env sets PGHOST and
// PGPORT. Checked by reading what a Client resolves rather than assuming it:
// with DATABASE_URL removed and PGHOST/PGPORT/PGDATABASE present, pg resolved
// host, port and database from them and the user from the OS account. No
// error - a working connection to a different database.
//
// That is the shape of the incident env.js already documents, where a script
// run from the repo root read the wrong .env and "reported the new schema as
// missing, while the same command run from api/ worked ... the runner applying
// 27 migrations to the wrong database was the other one". env.js closed the
// path where the WRONG url was composed; this closes the one where NO url is.
//
// DELIBERATELY NOT IN PRODUCTION, and the asymmetry is the point. Whatever
// production resolves today is what it has always resolved - if it were wrong
// nothing would work - so a refusal there could only take a working site down
// over a variable I cannot read. Everywhere else, an unset DATABASE_URL means
// composition failed, and quietly connecting as the OS user to a database
// named after them is never what was wanted.
// Exported so the asymmetry can be pinned by a test. It is the surprising
// half of this guard, and the kind of thing somebody later "fixes" into
// consistency without knowing why it is deliberate.
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

// NUMERIC arrives from pg as a string, because not every numeric fits a JS
// float. Every price, premium, spot and weight in this schema is NUMERIC, so
// without this they would be strings: `price * qty` would coerce and appear to
// work, while `price + fee` would concatenate.
//
// This registration is global to the pg module and has to happen before any
// query runs. It lived in server.js, which meant anything importing the pool
// without booting the server - scripts, migrations, cron, tests - silently got
// strings instead. It belongs next to the pool so there is one way to get a
// connection and it always behaves the same.
types.setTypeParser(types.builtins.NUMERIC, (value: string) =>
  value === null ? null : parseFloat(value)
);

// BIGINT arrives as a string for the same reason: int8 exceeds what a JS number
// can hold exactly. The only int8 columns in this schema are sequence-backed
// order numbers, which are nowhere near 2^53, so parsing them is safe - and
// leaving them as strings meant order_number reached the frontend as "242"
// while every type and comparison treated it as a number.
types.setTypeParser(types.builtins.INT8, (value: string) =>
  value === null ? null : Number(value)
);

// ssl.rejectUnauthorized is false, which accepts any certificate the server
// presents. That is not changed here: managed Postgres commonly serves a
// self-signed certificate, and turning verification on without knowing what
// production serves would refuse every connection. Recorded in FOLLOWUPS.md
// instead, next to the credential rotation it belongs with.
//
// *** TLS IS SKIPPED FOR A LOOPBACK HOST, AND THAT IS WHAT LETS THE SUITE RUN
// LOCALLY. *** `ssl` was unconditional, which is right for Railway and means
// the pool CANNOT talk to a Postgres that has no TLS at all. Pointing the suite
// at a local cluster produced 665 identical failures, every one of them
// `The server does not support SSL connections` - one cause, wearing 665 hats.
//
// Loopback only: 127.0.0.1, ::1 and the literal name `localhost`. Everything
// else keeps exactly the connection it had, so Railway, the read-only
// production URL and any host reached over a network are untouched. Encrypting
// a connection that never leaves the machine buys nothing, which is why every
// other tool in this stack defaults the same way.
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
