// Products: one row in each schema, written together, composed from three
// reference tables on the way out.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as products from "#db/products/repo.ts";
import * as compose from "#domain/products/compose.ts";
import type { StorefrontProduct, AdminProduct } from "#domain/products/compose.ts";
import type { ProductValues, Liveness } from "#db/products/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

interface HttpError extends Error {
  statusCode?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

// WHAT exchange.products DEFAULTS AND products.bullion DOES NOT.
//
// The create path sends a name and who made it, and exchange fills the other
// twenty-six columns from its own defaults. products.bullion declares seven of
// them NOT NULL with no default, so those seven have to be stated - and stated
// as exchange's values, or a product created after promotion would differ from
// one created before it.
//
// Read off the column defaults of exchange.products, not invented:
//   metal_id    Silver     mint_id  Generic     supplier_id  Elemetal
//   image_front / image_back  the placeholder silver artwork
//   stock / quantity          0
//
// They are literals here rather than a lookup because that is what a DEFAULT
// is - a constant on the column. Resolving them by name at runtime would make
// creating a product depend on a metal still being called "Silver".
const EXCHANGE_CREATE_DEFAULTS = {
  metal_id: "4e194eef-836f-4e9b-97f3-dda36a232dfb",
  mint_id: "61e1af1e-6cb3-44c7-bf45-683a58317ddf",
  supplier_id: "d7414aa4-28ec-4c26-8890-523c1812fb14",
  image_front: "/product_images/elemetal_products/silver/Product Name/FRONT.png",
  image_back: "/product_images/elemetal_products/silver/Product Name/BACK.png",
  stock: 0,
  quantity: 0,
} as const;

// What the admin form sends. Three of its fields are NAMES that the update
// resolves back to ids.
type ProductInput = {
  id?: string;
  metal?: string;
  supplier?: string;
  mint?: string;
  name?: string | null;
  description?: string | null;
  bid_premium?: number | null;
  ask_premium?: number | null;
  type?: string | null;
  display?: unknown;
  content?: number | null;
  gross?: number | null;
  purity?: number | null;
  variant_group?: string | null;
  shadow_offset?: number | null;
  stock?: number | null;
  slug?: string | null;
  homepage_display?: unknown;
  legal_tender?: unknown;
  domestic_tender?: unknown;
  sell_display?: unknown;
  is_generic?: unknown;
  variant_label?: string | null;
  quantity?: number | null;
  image_front?: string | null;
  image_back?: string | null;
  filter_category?: string | null;
};

export type ProductFilters = {
  metal_type?: string;
  filter_category?: string;
  product_type?: string;
};

// ------------------------------------------------------------------- reads

export async function getAllProducts(): Promise<StorefrontProduct[]> {
  const [rows, l] = await Promise.all([products.getStorefront(), compose.labels()]);
  return compose.storefront(rows, l);
}

export async function getSellProducts(): Promise<StorefrontProduct[]> {
  const [rows, l] = await Promise.all([products.getSell(), compose.labels()]);
  return compose.storefront(rows, l);
}

export async function getHomepageProducts(): Promise<StorefrontProduct[]> {
  const [rows, l] = await Promise.all([products.getHomepage(), compose.labels()]);
  return compose.storefront(rows, l);
}

// A LIST: a slug names a product's whole variant SET, not one row. See repo.ts.
export async function getProductFromSlug(slug: string): Promise<StorefrontProduct[]> {
  const [rows, l] = await Promise.all([products.getBySlug(slug), compose.labels()]);
  return compose.storefront(rows, l);
}

// THE METAL FILTER ARRIVES AS A NAME AND THE COLUMN IS AN ID.
//
// Resolved here, once, instead of by a join on every storefront query. A name
// that matches no metal yields no id, and the filter then matches nothing -
// which is exactly what the inner join did with an unknown name, so an unknown
// metal still returns an empty list rather than the whole shop.
export async function getFilteredProducts(
  filters: ProductFilters
): Promise<StorefrontProduct[]> {
  const l = await compose.labels();

  let metal_id: string | undefined;
  if (filters.metal_type) {
    for (const [id, name] of l.metalNames) if (name === filters.metal_type) metal_id = id;
    if (!metal_id) return [];
  }

  const rows = await products.getFiltered({
    metal_id,
    filter_category: filters.filter_category,
    product_type: filters.product_type,
  });
  return compose.storefront(rows, l);
}

export async function getAllAdminProducts(): Promise<AdminProduct[]> {
  const [rows, l] = await Promise.all([products.getAdminAll(), compose.labels()]);
  return compose.admin(rows, l);
}

export async function getAdminProductById(
  id: string, executor?: Executor
): Promise<AdminProduct | undefined> {
  const row = await products.getAdminOne(id, executor);
  if (!row) return undefined;
  return compose.admin([row], await compose.labels())[0];
}

export async function getAllTypes(): Promise<{ name: string }[]> {
  return await products.getTypes();
}

// The id of the product with this exact name, or null.
//
// Lives here rather than in features/checkout because the id it returns is a
// products.bullion id and this feature owns that table. The quote surface read
// it through `features/checkout/repo.next.ts` until 2026-08-29, which was a
// direct import around a `*_SOURCE` switch (D142); moving the read to its owner
// is what closes that, since there is now only one implementation to reach.
export async function findProductIdByName(
  name: string, executor?: Executor
): Promise<string | null> {
  return await products.findIdByName(name, executor);
}

export async function getLiveness(ids: string[], executor?: Executor): Promise<Liveness[]> {
  return await products.getLiveness(ids, executor);
}

// THE PRICE OF A PRODUCT COMES FROM THE SERVER, NOT THE CART.
//
// The client sends ids and quantities; everything else - premium, content,
// purity - is read back from the database. Only the quantity survives from the
// request, which is why this spreads the server row first and applies the
// quantity over it rather than the other way round.
export async function getItemsFromServer(
  items: { id: string; quantity: number }[]
): Promise<(StorefrontProduct & { quantity: number })[]> {
  const [rows, l] = await Promise.all([
    products.getByIds(items.map((i) => i.id)),
    compose.labels(),
  ]);
  const wanted = new Map(items.map((i) => [i.id, i.quantity]));
  return compose.storefront(rows, l).map((p) => ({ ...p, quantity: wanted.get(p.id) ?? 0 }));
}

// ------------------------------------------------------------------ writes

// The admin form sends `metal`, `supplier` and `mint` as NAMES. The statement
// this replaces resolved each with a scalar subquery inside the UPDATE, so a
// name matching nothing became NULL and the write failed on a NOT NULL column
// without saying which of the three was wrong. Resolved here, and named.
const resolve = (
  by: Map<string, string>, wanted: string | undefined, what: string
): string => {
  if (!wanted) throw badRequest(`a product needs a ${what}`);
  for (const [id, name] of by) if (name === wanted) return id;
  throw badRequest(`no ${what} called ${JSON.stringify(wanted)}`);
};

const flag = (v: unknown): boolean => v === true || v === "true";

export async function saveProduct(
  { product, user }: { product: ProductInput; user?: { name?: string } },
  executor?: Executor
): Promise<{ id: string } | undefined> {
  const id = product.id;
  if (!id) throw badRequest("a product update needs an id");

  const l = await compose.labels();
  const values: ProductValues = [
    resolve(l.metalNames, product.metal, "metal"),
    resolve(l.refinerNames, product.supplier, "supplier"),
    product.name ?? null,
    product.description ?? null,
    product.bid_premium ?? null,
    product.ask_premium ?? null,
    product.type ?? null,
    flag(product.display),
    product.content ?? null,
    product.gross ?? null,
    product.purity ?? null,
    resolve(l.mintNames, product.mint, "mint"),
    product.variant_group ?? null,
    product.shadow_offset ?? null,
    product.stock ?? null,
    user?.name ?? "",
    product.slug ?? null,
    flag(product.homepage_display),
    flag(product.legal_tender),
    flag(product.domestic_tender),
    flag(product.sell_display),
    flag(product.is_generic),
    product.variant_label ?? null,
    product.quantity ?? null,
    product.image_front ?? null,
    product.image_back ?? null,
    product.filter_category ?? null,
  ];

  const run = async (c: Executor): Promise<{ id: string } | undefined> => {
    const written = await products.update(id, values, c);
    if (!written) return undefined;
    return { id: written };
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// Insert then read back the composed admin shape, in one transaction - a
// failure on the read cannot leave a half-created product behind.
export async function createProduct(
  { created_by, name }: { created_by: string; name: string },
  executor?: Executor
): Promise<AdminProduct | undefined> {
  const run = async (c: Executor): Promise<AdminProduct | undefined> => {
    const id = randomUUID();
    await products.create(id, name, created_by, EXCHANGE_CREATE_DEFAULTS, c);
    return await getAdminProductById(id, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}
