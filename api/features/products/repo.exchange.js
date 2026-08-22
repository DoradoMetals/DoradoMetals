// Products data access.
//
// Still exchange-only: the schema migration for products is a transformation
// rather than a copy - mints carry description and website that belong on
// core.organizations - so it needs core.products, core.mints and
// core.organizations moved together. This commit only gets the SQL out of the
// HTTP layer, which is a prerequisite either way.
//
// These queries used to live inline in products/controller.js, which held
// twelve direct pool.query calls. That put SQL in the HTTP layer and, more
// importantly, meant none of them could be handed a client - so createProduct's
// insert-then-select could not be made atomic, and nothing here could join a
// caller's transaction.
//
// Every function takes an optional trailing executor.
import query from "#shared/db/query.js";
import {
  ADMIN_PRODUCT_FIELDS_WITH_ALIAS,
  PRODUCT_FIELDS,
} from "#features/products/constants.js";

// The four storefront lookups differ only in how they filter. The projection
// and joins are stated once so they cannot drift apart the way the order
// queries did.
const STOREFRONT = `
    SELECT product.${PRODUCT_FIELDS}, mint.name AS mint_name, metal.type AS metal_type
    FROM exchange.products product
    JOIN exchange.metals metal ON metal.id = product.metal_id
    JOIN exchange.mints mint ON mint.id = product.mint_id
`;

const ADMIN = `
    SELECT ${ADMIN_PRODUCT_FIELDS_WITH_ALIAS}, metal.type AS metal, supplier.name AS supplier, mint.name AS mint
    FROM exchange.products p
    JOIN exchange.metals metal ON metal.id = p.metal_id
    JOIN exchange.suppliers supplier ON supplier.id = p.supplier_id
    JOIN exchange.mints mint ON mint.id = p.mint_id
`;

export async function getAllProducts(executor) {
  const { rows } = await query(`${STOREFRONT} WHERE product.display = true ORDER BY product.id ASC`, [], executor);
  return rows;
}

export async function getSellProducts(executor) {
  const { rows } = await query(`${STOREFRONT} WHERE product.sell_display = true ORDER BY product.id ASC`, [], executor);
  return rows;
}

export async function getProductFromSlug(slug, executor) {
  const { rows } = await query(
    `${STOREFRONT} WHERE product.display = true AND product.slug = $1`,
    [slug],
    executor
  );
  return rows;
}

export async function getHomepageProducts(executor) {
  const { rows } = await query(
    `${STOREFRONT} WHERE product.display = true AND product.homepage_display = true ORDER BY product.id ASC`,
    [],
    executor
  );
  return rows;
}

// Filters are optional and combine, so the predicate is built rather than
// written out. Values are still bound as parameters - the only thing
// interpolated is the placeholder number.
export async function getFilteredProducts(
  { metal_type, filter_category, product_type } = {},
  executor
) {
  const conditions = ["product.display = true"];
  const values = [];

  if (metal_type) {
    values.push(metal_type);
    conditions.push(`metal.type = $${values.length}`);
  }
  if (filter_category) {
    values.push(filter_category);
    conditions.push(`product.filter_category = $${values.length}`);
  }
  if (product_type) {
    values.push(product_type);
    conditions.push(`product.product_type = $${values.length}`);
  }

  const { rows } = await query(
    `${STOREFRONT} WHERE ${conditions.join(" AND ")} ORDER BY product.product_name ASC, product.id ASC`,
    values,
    executor
  );
  return rows;
}

export async function getAllAdminProducts(executor) {
  const { rows } = await query(`${ADMIN} ORDER BY product_name ASC, p.id ASC`, [], executor);
  return rows;
}

export async function getAdminProductById(id, executor) {
  const { rows } = await query(`${ADMIN} WHERE p.id = $1`, [id], executor);
  return rows[0];
}

export async function getAllTypes(executor) {
  const { rows } = await query(
    `SELECT DISTINCT product_type AS name FROM exchange.products`,
    [],
    executor
  );
  return rows;
}

export async function updateProduct(product, user_name, executor) {
  const sql = `
    UPDATE exchange.products SET
      metal_id = (SELECT id FROM exchange.metals WHERE type = $1),
      supplier_id = (SELECT id FROM exchange.suppliers WHERE name = $2),
      product_name = $3,
      product_description = $4,
      bid_premium = $5,
      ask_premium = $6,
      product_type = $7,
      display = $8,
      content = $9,
      gross = $10,
      purity = $11,
      mint_id = (SELECT id FROM exchange.mints WHERE name = $12),
      variant_group = $13,
      shadow_offset = $14,
      stock = $15,
      updated_by = $16,
      updated_at = NOW(),
      slug= $17,
      homepage_display = $18,
      legal_tender = $19,
      domestic_tender = $20,
      sell_display = $21,
      is_generic = $22,
      variant_label = $23,
      quantity = $24,
      image_front = $25,
      image_back = $26,
      filter_category = $27
    WHERE id = $28
  `;
  const values = [
    product.metal,
    product.supplier,
    product.product_name,
    product.product_description,
    product.bid_premium,
    product.ask_premium,
    product.product_type,
    product.display,
    product.content,
    product.gross,
    product.purity,
    product.mint,
    product.variant_group,
    product.shadow_offset,
    product.stock,
    user_name,
    product.slug,
    product.homepage_display,
    product.legal_tender,
    product.domestic_tender,
    product.sell_display,
    product.is_generic,
    product.variant_label,
    product.quantity,
    product.image_front,
    product.image_back,
    product.filter_category,
    product.id,
  ];
  return await query(sql, values, executor);
}

export async function insertProduct({ created_by, name }, executor) {
  const { rows } = await query(
    `INSERT INTO exchange.products (created_by, updated_by, product_name)
     VALUES ($1, $1, $2)
     RETURNING id`,
    [created_by, name],
    executor
  );
  return rows[0].id;
}

export async function getItemsFromIds(ids, executor) {
  const { rows } = await query(`${STOREFRONT} WHERE product.id = ANY($1)`, [ids], executor);
  return rows;
}
