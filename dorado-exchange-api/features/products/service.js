import * as productRepo from "#features/products/repo.js"

export async function getItemsFromServer(items) {
  const productIds = items.map((item) => item.id);
  const serverItems = await productRepo.getItemsFromIds(productIds);
  const clientMap = new Map(
    items.map((item) => [item.id, item.quantity])
  );
  return serverItems.map((si) => ({
    ...si,
    quantity: clientMap.get(si.id) ?? 0,
  }));
}