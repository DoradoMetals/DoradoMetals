process.env.USE_TEST_DB = "1"; process.env.NODE_ENV = "test";
const { default: pool } = await import("#pool");
const { rows } = await pool.query(process.argv[2]);
console.log(JSON.stringify(rows, null, 1).slice(0, 4000));
await pool.end();
