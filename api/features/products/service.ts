// Products, plus the one piece of logic that is not a pass-through.
import * as productRepo from "#features/products/repo.js";
import type { PoolClient } from "pg";
import type {
  StorefrontProductRow,
  AdminProductRow,
  ProductInput,
  ProductFilters,
} from "#features/products/repo.next.ts";

// THE PRICE OF A PRODUCT COMES FROM THE SERVER, NOT THE CART.
//
// The client sends ids and quantities; everything else - premium, content,
// purity - is read back from the database. Only the quantity survives from the
// request, which is why this returns the server row spread first and the
// quantity applied over it rather than the other way round.
export async function getItemsFromServer(
  items: { id: string; quantity: number }[]
): Promise<(StorefrontProductRow & { quantity: number })[]> {
  const productIds = items.map((item) => item.id);
  const serverItems = await productRepo.getItemsFromIds(productIds);
  const clientMap = new Map(items.map((item) => [item.id, item.quantity]));
  return serverItems.map((si: StorefrontProductRow) => ({
    ...si,
    quantity: clientMap.get(si.id) ?? 0,
  }));
}

export const getAllProducts = (): Promise<StorefrontProductRow[]> =>
  productRepo.getAllProducts();
export const getSellProducts = (): Promise<StorefrontProductRow[]> =>
  productRepo.getSellProducts();
// A LIST, though a slug identifies one product - both repos return one, and the
// controller takes [0].
export const getProductFromSlug = (slug: string): Promise<StorefrontProductRow[]> =>
  productRepo.getProductFromSlug(slug);
export const getHomepageProducts = (): Promise<StorefrontProductRow[]> =>
  productRepo.getHomepageProducts();
export const getFilteredProducts = (
  filters: ProductFilters
): Promise<StorefrontProductRow[]> => productRepo.getFilteredProducts(filters);
export const getAllAdminProducts = (): Promise<AdminProductRow[]> =>
  productRepo.getAllAdminProducts();
export const getAllTypes = (): Promise<{ name: string }[]> => productRepo.getAllTypes();

export async function saveProduct({
  product,
  user,
}: {
  product: ProductInput;
  user?: { name?: string };
}): Promise<unknown> {
  return productRepo.updateProduct(product, user?.name);
}

// Insert then read back the joined admin shape. One transaction so a failure
// on the read cannot leave a half-created product behind - which the previous
// inline version could, since it ran both on the pool.
export async function createProduct({
  created_by,
  name,
}: {
  created_by: string;
  name: string;
}): Promise<AdminProductRow | undefined> {
  const withTransaction = (await import("#shared/db/withTransaction.js")).default;
  return withTransaction(async (client: PoolClient) => {
    const id = await productRepo.insertProduct({ created_by, name }, client);
    return productRepo.getAdminProductById(id, client);
  });
}
