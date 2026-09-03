process.env.USE_TEST_DB = "1";
process.env.NODE_ENV = "test";
const { default: pool } = await import("#db");
const tables = process.argv.slice(2);
for (const t of tables) {
  const [schema, table] = t.split(".");
  const { rows } = await pool.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2
      ORDER BY ordinal_position`, [schema, table]);
  console.log(`=== ${t} ===`);
  for (const r of rows) console.log(`  ${r.column_name} ${r.data_type==='USER-DEFINED'?r.udt_name:r.data_type}${r.is_nullable==='NO'?' NOT NULL':''}${r.column_default?' DEF '+r.column_default:''}`);
}
await pool.end();
