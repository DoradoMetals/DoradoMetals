import pool from '../db.js';
import { PRODUCT_FIELDS } from '../constants/productsConstants.js';

export async function getItemsFromIds(ids) {
  const query = `
    SELECT product.${PRODUCT_FIELDS}, mint.name AS mint_name, metal.type AS metal_type
    FROM exchange.products product
    JOIN exchange.metals metal ON metal.id = product.metal_id
    JOIN exchange.mints mint ON mint.id = product.mint_id
    WHERE product.id = ANY($1)
  `;
  const values = [ids];
  const result = await pool.query(query, values);
  return result.rows;
}
