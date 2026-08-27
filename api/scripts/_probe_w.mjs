import "#env";
import pool from "#db";
const { rows } = await pool.query(`
  SELECT schemaname||'.'||tablename AS t FROM pg_tables
   WHERE schemaname NOT IN ('exchange','public','pg_catalog','information_schema')
   ORDER BY 1`);
console.log(rows.map(r => r.t).join("\n"));
await pool.end();
