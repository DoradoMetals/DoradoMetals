// Products: one row in each schema, written together, composed from three reference tables on the way out.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as products from "#db/products/repo.ts";
import * as compose from "#domain/products/compose.ts";
import type { StorefrontProduct, AdminProduct } from "#domain/products/compose.ts";
import type { ProductPatch, Liveness, PublicProductRow } from "#db/products/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
// The transport layer's parsed body - the contract IS the input type now
// (no hand-written ProductInput mirroring it).
import type { ProductPatch as ProductPatchInput } from "@dorado/contracts";

// What exchange.products defaults and products.bullion does not: products.bullion declares seven columns NOT NULL with no default, so a create must state them, and stated as exchange's own defaults so a product doesn't differ across promotion.
// Literals, not a runtime lookup: resolving by name (e.g. "Silver") would make product creation depend on that metal still existing under that name.
const EXCHANGE_CREATE_DEFAULTS = {
  metal_id: "4e194eef-836f-4e9b-97f3-dda36a232dfb",
  mint_id: "61e1af1e-6cb3-44c7-bf45-683a58317ddf",
  supplier_id: "d7414aa4-28ec-4c26-8890-523c1812fb14",
  image_front: "/product_images/elemetal_products/silver/Product Name/FRONT.png",
  image_back: "/product_images/elemetal_products/silver/Product Name/BACK.png",
  stock: 0,
  quantity: 0,
} as const;

export type ProductFilters = {
  metal_type?: string;
  filter_category?: string;
  product_type?: string;
};

// ------------------------------------------------------------------- reads

// Each of these reads two independent things (the product rows, and the
// reference-table labels) and neither takes a client of its own - so both
// default to the shared pool. Sequential rather than Promise.all: genuinely
// concurrent when unpinned, but the same client under a pinned test
// transaction - see domain/products/compose.ts's labels() for the fuller
// note.
export async function getAllProducts(): Promise<StorefrontProduct[]> {
  const rows = await products.getStorefront();
  const l = await compose.labels();
  return compose.storefront(rows, l);
}

export async function getSellProducts(): Promise<StorefrontProduct[]> {
  const rows = await products.getSell();
  const l = await compose.labels();
  return compose.storefront(rows, l);
}

export async function getHomepageProducts(): Promise<StorefrontProduct[]> {
  const rows = await products.getHomepage();
  const l = await compose.labels();
  return compose.storefront(rows, l);
}

// A LIST: a slug names a product's whole variant SET, not one row. See repo.ts.
export async function getProductFromSlug(slug: string): Promise<StorefrontProduct[]> {
  const rows = await products.getBySlug(slug);
  const l = await compose.labels();
  return compose.storefront(rows, l);
}

// The metal filter arrives as a NAME; the column is an id — resolved here once rather than by a join per query. An unknown name yields no id and the filter matches nothing, same as the inner join it replaces.
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
  const rows = await products.getAdminAll();
  const l = await compose.labels();
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

// The id of the product with this exact name, or null — lives here (not checkout) because the id is a products.bullion id and this feature owns that table.
export async function findProductIdByName(
  name: string, executor?: Executor
): Promise<string | null> {
  return await products.findIdByName(name, executor);
}

export async function getLiveness(ids: string[], executor?: Executor): Promise<Liveness[]> {
  return await products.getLiveness(ids, executor);
}

// The catalogue rows behind a set of ids. Checkout reads a product's metal
// and its bid premium through here rather than joining products.bullion into
// its own write - the feature that owns the table answers for it.
export async function getByIds(
  ids: string[], executor?: Executor
): Promise<PublicProductRow[]> {
  return await products.getByIds(ids, executor);
}

// The price of a product comes from the server, not the cart: client sends
// ids/quantities, everything else (premium, content, purity) is read back.
// Only quantity survives from the request; every other field is named
// explicitly.
export async function getItemsFromServer(
  items: { id: string; quantity: number }[]
): Promise<(StorefrontProduct & { quantity: number })[]> {
  const rows = await products.getByIds(items.map((i) => i.id));
  const l = await compose.labels();
  const wanted = new Map(items.map((i) => [i.id, i.quantity]));
  return compose.storefront(rows, l).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    content: p.content,
    purity: p.purity,
    gross: p.gross,
    bid_premium: p.bid_premium,
    ask_premium: p.ask_premium,
    type: p.type,
    image_front: p.image_front,
    image_back: p.image_back,
    variant_group: p.variant_group,
    shadow_offset: p.shadow_offset,
    slug: p.slug,
    legal_tender: p.legal_tender,
    domestic_tender: p.domestic_tender,
    sell_display: p.sell_display,
    is_generic: p.is_generic,
    variant_label: p.variant_label,
    metal_type: p.metal_type,
    mint_name: p.mint_name,
    quantity: wanted.get(p.id) ?? 0,
  }));
}

// ------------------------------------------------------------------ writes

// The body carries `metal_id`/`supplier_id`/`mint_id` now, not names (ruling
// 43): the contract (ProductPatch) is the server's own row shape, so a
// caller that names an id the database doesn't have gets the database's own
// foreign-key refusal rather than this service resolving a name first. The
// old `resolve()`/`flag()` helpers - a name-to-id lookup and a stringy-
// boolean coercion - are gone with the body shape that needed them; a
// caller sends real booleans, which strict parsing at the transport layer
// already enforces.
export async function saveProduct(
  { product }: { product: ProductPatchInput },
  executor?: Executor
): Promise<{ id: string } | undefined> {
  const run = async (c: Executor): Promise<{ id: string } | undefined> => {
    const written = await products.update(
      product.id,
      {
        metal_id: product.metal_id, supplier_id: product.supplier_id, mint_id: product.mint_id,
        name: product.name, description: product.description,
        bid_premium: product.bid_premium, ask_premium: product.ask_premium, type: product.type,
        display: product.display, content: product.content, gross: product.gross,
        purity: product.purity, variant_group: product.variant_group,
        shadow_offset: product.shadow_offset, stock: product.stock, slug: product.slug,
        homepage_display: product.homepage_display, legal_tender: product.legal_tender,
        domestic_tender: product.domestic_tender, sell_display: product.sell_display,
        is_generic: product.is_generic, variant_label: product.variant_label,
        quantity: product.quantity, image_front: product.image_front,
        image_back: product.image_back, filter_category: product.filter_category,
      },
      c
    );
    if (!written) return undefined;
    return { id: product.id };
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// Insert then read back the composed admin shape in one transaction — a failure on the read cannot leave a half-created product behind.
// created_by is not a field of this input: the trigger writes the author from the session (migration 116), so a caller can't claim to be somebody else.
export async function createProduct(
  { name }: { name: string },
  executor?: Executor
): Promise<AdminProduct | undefined> {
  const run = async (c: Executor): Promise<AdminProduct | undefined> => {
    const id = randomUUID();
    await products.create({
      id,
      name,
      metal_id: EXCHANGE_CREATE_DEFAULTS.metal_id,
      mint_id: EXCHANGE_CREATE_DEFAULTS.mint_id,
      supplier_id: EXCHANGE_CREATE_DEFAULTS.supplier_id,
      image_front: EXCHANGE_CREATE_DEFAULTS.image_front,
      image_back: EXCHANGE_CREATE_DEFAULTS.image_back,
      stock: EXCHANGE_CREATE_DEFAULTS.stock,
      quantity: EXCHANGE_CREATE_DEFAULTS.quantity,
    }, c);
    return await getAdminProductById(id, c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}
