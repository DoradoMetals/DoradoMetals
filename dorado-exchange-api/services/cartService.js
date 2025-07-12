const pool = require("../db");
const cartRepo = require("../repositories/cartRepo");

async function getCart(user_id) {
  return await cartRepo.getCart(user_id);
}

async function syncCart(user_id, items) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const newCart = await cartRepo.createNew(user_id, client);
    let cart_id = newCart.id ?? "";
    if (!newCart.id) {
      cart_id = await cartRepo.getCartId(user_id, client);
    }

    await cartRepo.clearCart(cart_id, client);

    await cartRepo.addItems(items, cart_id, client);

    await client.query("COMMIT");

    return "Cart Synced";
  } catch (error) {
    await client.query("ROLLBACK");
    return error;
  } finally {
    client.release();
  }
}

module.exports = {
  getCart,
  syncCart,
};
