// Mints read from the legacy exchange schema.
//
// Mints previously had no owning feature: the table was queried from
// products/controller.js and joined from carts/repo.js, so two features both
// half-owned it and neither was responsible for it.
//
// The columns are listed rather than selected with *, so that the new-schema
// implementation has an explicit shape to match.
import query from "#shared/db/query.js";

export const MINT_FIELDS = [
  "id",
  "name",
  "type",
  "country",
  "description",
  "website",
  "created_at",
  "updated_at",
].join(", ");

export async function getAllMints(executor) {
  const { rows } = await query(
    `SELECT ${MINT_FIELDS} FROM exchange.mints ORDER BY name ASC, id ASC`,
    [],
    executor
  );
  return rows;
}
