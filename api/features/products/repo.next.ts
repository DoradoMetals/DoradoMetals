// Products read from products.bullion, plus metals, mints and refiners.
//
// products.bullion names three columns differently - name, description and type
// where exchange has product_name, product_description and product_type - and
// the field lists in constants.bullion.js alias them back, so the wire shape is
// unchanged.
//
// The joins change too: metals.metals calls its label column `name` where
// exchange.metals calls it `type`, mints moved into the products schema, and a
// supplier is now reassembled by refiners.exchange_compat.
//
// These queries used to live inline in products/controller.js, which held
// twelve direct pool.query calls. That put SQL in the HTTP layer and, more
// importantly, meant none of them could be handed a client - so createProduct's
// insert-then-select could not be made atomic, and nothing here could join a
// caller's transaction.
//
// Every function takes an optional trailing executor.
import query from "#shared/db/query.js";
import type { BullionWire } from "@dorado/contracts";
import type { products } from "@dorado/contracts";
import type { PoolClient, QueryResult } from "pg";
import {
  BULLION_ADMIN_PRODUCT_FIELDS_WITH_ALIAS as ADMIN_PRODUCT_FIELDS_WITH_ALIAS,
  BULLION_PRODUCT_FIELDS as PRODUCT_FIELDS,
} from "#features/products/constants.bullion.ts";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// THE STOREFRONT ROW IS BullionWire, not a hand-written restatement of the
// projection. validate:wire already parses real rows through it for BOTH
// implementations, so it is the one description of this shape that has been
// checked against the database - and BULLION_PRODUCT_FIELDS plus the two joined
// names is exactly what it declares. No timestamps, so nothing to override:
// the storefront deliberately does not return them.
export type StorefrontProductRow = BullionWire;

// The admin row has no wire contract, so it is composed from the table plus the
// three names joined in. created_at and updated_at ARE returned here, and pg
// hands back a Date where a contract would say string - the storefront row
// dodges that only by not selecting them.
export type AdminProductRow = Pick<
  products.BullionRow,
  | "id"
  | "name"
  | "description"
  | "bid_premium"
  | "ask_premium"
  | "type"
  | "image_front"
  | "image_back"
  | "display"
  | "content"
  | "gross"
  | "purity"
  | "variant_group"
  | "shadow_offset"
  | "stock"
  | "created_by"
  | "updated_by"
  | "homepage_display"
  | "filter_category"
  | "quantity"
  | "slug"
  | "legal_tender"
  | "domestic_tender"
  | "sell_display"
  | "is_generic"
  | "variant_label"
> & {
  created_at: Date | null;
  updated_at: Date | null;
  // Joined: the label columns, not the ids. `supplier` comes through
  // refiners.exchange_compat, which reassembles what exchange.suppliers was.
  metal: string;
  supplier: string;
  mint: string;
};

// What the admin form sends. This arrives as req.body, so it is the shape the
// UPDATE reads rather than anything the database guarantees - and three of its
// fields are NAMES that the query resolves back to ids.
export type ProductInput = Partial<
  Omit<AdminProductRow, "created_at" | "updated_at" | "metal" | "supplier" | "mint">
> & {
  id?: string;
  metal?: string;
  supplier?: string;
  mint?: string;
};

// The optional filters the storefront combines. Absent means "do not filter",
// which is why every one is optional rather than nullable.
export type ProductFilters = {
  metal_type?: string;
  filter_category?: string;
  product_type?: string;
};

// The four storefront lookups differ only in how they filter. The projection
// and joins are stated once so they cannot drift apart the way the order
// queries did.
const STOREFRONT = `
    SELECT ${PRODUCT_FIELDS}, mint.name AS mint_name, metal.name AS metal_type
    FROM products.bullion product
    JOIN metals.metals metal ON metal.id = product.metal_id
    JOIN products.mints mint ON mint.id = product.mint_id
`;

const ADMIN = `
    SELECT ${ADMIN_PRODUCT_FIELDS_WITH_ALIAS}, metal.name AS metal, supplier.name AS supplier, mint.name AS mint
    FROM products.bullion p
    JOIN metals.metals metal ON metal.id = p.metal_id
    JOIN refiners.exchange_compat supplier ON supplier.id = p.supplier_id
    JOIN products.mints mint ON mint.id = p.mint_id
`;

export async function getAllProducts(executor?: Executor): Promise<StorefrontProductRow[]> {
  const { rows } = await query<StorefrontProductRow>(
    `${STOREFRONT} WHERE product.display = true ORDER BY product.id ASC`,
    [],
    executor
  );
  return rows;
}

export async function getSellProducts(executor?: Executor): Promise<StorefrontProductRow[]> {
  const { rows } = await query<StorefrontProductRow>(
    `${STOREFRONT} WHERE product.sell_display = true ORDER BY product.id ASC`,
    [],
    executor
  );
  return rows;
}

// Returns a LIST even though a slug identifies one product, matching
// repo.exchange.js - the controller takes [0].
export async function getProductFromSlug(
  slug: string,
  executor?: Executor
): Promise<StorefrontProductRow[]> {
  const { rows } = await query<StorefrontProductRow>(
    `${STOREFRONT} WHERE product.display = true AND product.slug = $1`,
    [slug],
    executor
  );
  return rows;
}

export async function getHomepageProducts(executor?: Executor): Promise<StorefrontProductRow[]> {
  const { rows } = await query<StorefrontProductRow>(
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
  { metal_type, filter_category, product_type }: ProductFilters = {},
  executor?: Executor
): Promise<StorefrontProductRow[]> {
  const conditions = ["product.display = true"];
  const values: string[] = [];

  if (metal_type) {
    values.push(metal_type);
    conditions.push(`metal.name = $${values.length}`);
  }
  if (filter_category) {
    values.push(filter_category);
    conditions.push(`product.filter_category = $${values.length}`);
  }
  if (product_type) {
    values.push(product_type);
    conditions.push(`product.type = $${values.length}`);
  }

  const { rows } = await query<StorefrontProductRow>(
    `${STOREFRONT} WHERE ${conditions.join(" AND ")} ORDER BY product.name ASC, product.id ASC`,
    values,
    executor
  );
  return rows;
}

export async function getAllAdminProducts(executor?: Executor): Promise<AdminProductRow[]> {
  const { rows } = await query<AdminProductRow>(`${ADMIN} ORDER BY p.name ASC, p.id ASC`, [], executor);
  return rows;
}

export async function getAdminProductById(
  id: string,
  executor?: Executor
): Promise<AdminProductRow | undefined> {
  const { rows } = await query<AdminProductRow>(`${ADMIN} WHERE p.id = $1`, [id], executor);
  return rows[0];
}

export async function getAllTypes(executor?: Executor): Promise<{ name: string }[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT DISTINCT type AS name FROM products.bullion`,
    [],
    executor
  );
  return rows;
}

export async function updateProduct(
  product: ProductInput,
  user_name: string,
  executor?: Executor
): Promise<QueryResult> {
  const sql = `
    UPDATE products.bullion SET
      metal_id = (SELECT id FROM metals.metals WHERE name = $1),
      supplier_id = (SELECT id FROM refiners.exchange_compat WHERE name = $2),
      name = $3,
      description = $4,
      bid_premium = $5,
      ask_premium = $6,
      type = $7,
      display = $8,
      content = $9,
      gross = $10,
      purity = $11,
      mint_id = (SELECT id FROM products.mints WHERE name = $12),
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
    product.name,
    product.description,
    product.bid_premium,
    product.ask_premium,
    product.type,
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

// Returns the new id, not the row - repo.exchange.js does the same, and the
// service selects the product back afterwards.
export async function insertProduct(
  { created_by, name }: { created_by: string; name: string },
  executor?: Executor
): Promise<products.BullionRow["id"]> {
  const { rows } = await query<Pick<products.BullionRow, "id">>(
    `INSERT INTO products.bullion (created_by, updated_by, name)
     VALUES ($1, $1, $2)
     RETURNING id`,
    [created_by, name],
    executor
  );
  return rows[0].id;
}

// Whether each id is live, for the two directions independently. See the
// exchange implementation for why this is its own query rather than a field
// added to the storefront projection.
export async function getLiveness(
  ids: string[],
  executor?: Executor
): Promise<{ id: string; display: boolean; sell_display: boolean }[]> {
  const { rows } = await query<{ id: string; display: boolean; sell_display: boolean }>(
    `SELECT id, display, sell_display FROM products.bullion WHERE id = ANY($1)`,
    [ids],
    executor
  );
  return rows;
}

export async function getItemsFromIds(
  ids: string[],
  executor?: Executor
): Promise<StorefrontProductRow[]> {
  const { rows } = await query<StorefrontProductRow>(
    `${STOREFRONT} WHERE product.id = ANY($1)`,
    [ids],
    executor
  );
  return rows;
}

// Copies a product from exchange.products, id included. Server-side, so the
// microseconds on created_at and updated_at survive - a JS round trip would
// truncate them to milliseconds.
//
// The three renamed columns are mapped here rather than aliased: this is the
// write direction, so it targets the physical names.
export async function mirrorProduct(
  id: string,
  executor?: Executor
): Promise<Pick<products.BullionRow, "id"> | undefined> {
  const sql = `
    INSERT INTO products.bullion (
      id, metal_id, mint_id, supplier_id, name, description, type,
      bid_premium, ask_premium, display, homepage_display, sell_display,
      legal_tender, domestic_tender, is_generic, content, gross, purity,
      variant_group, variant_label, shadow_offset, slug, filter_category,
      image_front, image_back, stock, quantity,
      created_by, updated_by, created_at, updated_at
    )
    SELECT
      e.id, e.metal_id, e.mint_id, e.supplier_id, e.product_name,
      e.product_description, e.product_type,
      e.bid_premium, e.ask_premium, e.display, e.homepage_display, e.sell_display,
      e.legal_tender, e.domestic_tender, e.is_generic, e.content, e.gross, e.purity,
      e.variant_group, e.variant_label, e.shadow_offset, e.slug, e.filter_category,
      e.image_front, e.image_back, e.stock, e.quantity,
      e.created_by, e.updated_by, e.created_at, e.updated_at
    FROM exchange.products e
    WHERE e.id = $1
    ON CONFLICT (id) DO UPDATE SET
      metal_id = EXCLUDED.metal_id, mint_id = EXCLUDED.mint_id,
      supplier_id = EXCLUDED.supplier_id, name = EXCLUDED.name,
      description = EXCLUDED.description, type = EXCLUDED.type,
      bid_premium = EXCLUDED.bid_premium, ask_premium = EXCLUDED.ask_premium,
      display = EXCLUDED.display, homepage_display = EXCLUDED.homepage_display,
      sell_display = EXCLUDED.sell_display, legal_tender = EXCLUDED.legal_tender,
      domestic_tender = EXCLUDED.domestic_tender, is_generic = EXCLUDED.is_generic,
      content = EXCLUDED.content, gross = EXCLUDED.gross, purity = EXCLUDED.purity,
      variant_group = EXCLUDED.variant_group, variant_label = EXCLUDED.variant_label,
      shadow_offset = EXCLUDED.shadow_offset, slug = EXCLUDED.slug,
      filter_category = EXCLUDED.filter_category,
      image_front = EXCLUDED.image_front, image_back = EXCLUDED.image_back,
      stock = EXCLUDED.stock, quantity = EXCLUDED.quantity,
      created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
      created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at
    RETURNING id;
  `;
  const { rows } = await query<Pick<products.BullionRow, "id">>(sql, [id], executor);
  return rows[0];
}
