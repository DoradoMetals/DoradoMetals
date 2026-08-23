import withTransaction from "#shared/db/withTransaction.js";
import * as cartRepo from "#features/checkout/repo.js"

export async function getCart(user_id) {
  return await cartRepo.getCart(user_id);
}

export async function syncCart(user_id, items) {
  return withTransaction(async (client) => {
    await cartRepo.replaceCart(user_id, items, client);
    return "Cart Synced";
  });
}

export async function getSellCart(user_id) {
  if (!user_id) {
    const err = new Error("Missing user_id");
    err.status = 400;
    throw err;
  }

  const cartId = await cartRepo.getSellCartId(user_id);
  if (!cartId) return [];

  const scrapRows = await cartRepo.getSellCartScrapItems(cartId);
  const scrapItems = scrapRows.map((row) => ({
    type: "scrap",
    data: {
      id: row.scrap_id,
      ...row,
      pre_melt: Number(row.pre_melt),
      purity: Number(row.purity),
      content: Number(row.content),
      quantity: row.quantity,
      bid_premium: Number(row.bid_premium),
    },
  }));

  const productRows = await cartRepo.getSellCartProductItems(cartId);
  const productItems = productRows.map((row) => ({
    type: "product",
    data: {
      ...row,
      quantity: row.quantity,
    },
  }));

  return [...scrapItems, ...productItems];
}

export async function syncSellCart(user_id, cart) {
  if (!user_id || !Array.isArray(cart)) {
    const err = new Error("Invalid payload");
    err.status = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    await cartRepo.replaceSellCart(user_id, cart, client);
    return "Sell Cart Synced";
  });
}

