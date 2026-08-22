import * as productRepo from "#features/products/repo.js";

export async function getItemsFromServer(items) {
  const productIds = items.map((item) => item.id);
  const serverItems = await productRepo.getItemsFromIds(productIds);
  const clientMap = new Map(items.map((item) => [item.id, item.quantity]));
  return serverItems.map((si) => ({
    ...si,
    quantity: clientMap.get(si.id) ?? 0,
  }));
}

export const getAllProducts = () => productRepo.getAllProducts();
export const getSellProducts = () => productRepo.getSellProducts();
export const getProductFromSlug = (slug) => productRepo.getProductFromSlug(slug);
export const getHomepageProducts = () => productRepo.getHomepageProducts();
export const getFilteredProducts = (filters) => productRepo.getFilteredProducts(filters);
export const getAllAdminProducts = () => productRepo.getAllAdminProducts();
export const getAllMetals = () => productRepo.getAllMetals();
export const getAllMints = () => productRepo.getAllMints();
export const getAllTypes = () => productRepo.getAllTypes();

export async function saveProduct({ product, user }) {
  return productRepo.updateProduct(product, user?.name);
}

// Insert then read back the joined admin shape. One transaction so a failure
// on the read cannot leave a half-created product behind - which the previous
// inline version could, since it ran both on the pool.
export async function createProduct({ created_by, name }) {
  const withTransaction = (await import("#shared/db/withTransaction.js")).default;
  return withTransaction(async (client) => {
    const id = await productRepo.insertProduct({ created_by, name }, client);
    return productRepo.getAdminProductById(id, client);
  });
}
