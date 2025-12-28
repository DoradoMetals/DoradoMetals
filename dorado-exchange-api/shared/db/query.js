import pool from "#db";

export default async function query(sql, params = [], client) {
  if (client) return client.query(sql, params);
  return pool.query(sql, params);
}
