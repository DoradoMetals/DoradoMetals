// Mints data access.
//
// Mints previously had no owning feature: the table was queried from
// products/controller.js and joined from carts/repo.js, so two features both
// half-owned it and neither was responsible for it.
import query from "#shared/db/query.js";

export async function getAllMints(executor) {
  const { rows } = await query(
    `SELECT * FROM exchange.mints ORDER BY name ASC`,
    [],
    executor
  );
  return rows;
}
