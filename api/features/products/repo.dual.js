// Dual-write phase of the products schema migration.
//
// Writes go to exchange and are mirrored into products.bullion, both inside one
// transaction. Reads come from the new tables so they are exercised by real
// traffic while exchange stays a complete replica.
//
// Products carry bid_premium and ask_premium, which feed every price quoted -
// calculateItemPrice is content * (bid_spot * premium) - so a divergence here
// misprices orders rather than merely displaying something odd.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/products/repo.exchange.js";
import * as next from "#features/products/repo.next.ts";

export const getAllProducts = next.getAllProducts;
export const getSellProducts = next.getSellProducts;
export const getProductFromSlug = next.getProductFromSlug;
export const getHomepageProducts = next.getHomepageProducts;
export const getFilteredProducts = next.getFilteredProducts;
export const getAllAdminProducts = next.getAllAdminProducts;
export const getAdminProductById = next.getAdminProductById;
export const getAllTypes = next.getAllTypes;
export const getItemsFromIds = next.getItemsFromIds;

const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export async function updateProduct(product, user_name, executor) {
  return both(executor, async (c) => {
    const result = await exchange.updateProduct(product, user_name, c);
    await next.mirrorProduct(product.id, c);
    return result;
  });
}

export async function insertProduct(draft, executor) {
  return both(executor, async (c) => {
    const id = await exchange.insertProduct(draft, c);
    await next.mirrorProduct(id, c);
    return id;
  });
}
