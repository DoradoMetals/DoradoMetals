import "#env";
import pg from 'pg';

const { Pool, types } = pg;

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
types.setTypeParser(types.builtins.NUMERIC, (value) =>
  value === null ? null : parseFloat(value)
);

// BIGINT arrives as a string for the same reason: int8 exceeds what a JS number
// can hold exactly. The only int8 columns in this schema are sequence-backed
// order numbers, which are nowhere near 2^53, so parsing them is safe - and
// leaving them as strings meant order_number reached the frontend as "242"
// while every type and comparison treated it as a number.
types.setTypeParser(types.builtins.INT8, (value) =>
  value === null ? null : Number(value)
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;
