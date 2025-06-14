const pool = require("../db");
const { auth } = require("../auth");
const { fromNodeHeaders } = require("better-auth/node");

const salesOrderRepo = require("../repositories/salesOrderRepo");
const stripeRepo = require("../repositories/stripeRepo");
const transactionsRepo = require("../repositories/transactionRepo");
const productRepo = require("../repositories/productRepo");
const { calculateSalesOrderTotal } = require("../utils/price-calculations");

async function getById(orderId) {
  return salesOrderRepo.findById(orderId);
}

async function listOrdersForUser(userId) {
  return salesOrderRepo.findAllByUser(userId);
}

async function getAll() {
  return salesOrderRepo.getAll();
}

async function getMetalsForOrder(orderId) {
  return salesOrderRepo.findMetalsByOrderId(orderId);
}

async function getItemsFromServer(order_items) {
  const productIds = order_items.map((item) => item.id);
  const serverItems = await productRepo.getItemsFromIds(productIds);
  const clientMap = new Map(
    order_items.map((item) => [item.id, item.quantity])
  );
  return serverItems.map((si) => ({
    ...si,
    quantity: clientMap.get(si.id) ?? 0,
  }));
}

async function createSalesOrder(
  { sales_order, payment_intent_id, spot_prices },
  headers
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const items = await getItemsFromServer(sales_order.items);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderPrices = calculateSalesOrderTotal(
      items,
      sales_order.using_funds,
      spot_prices,
      session.user,
      sales_order.service.value,
      sales_order.payment_method
    );

    const orderId = await salesOrderRepo.insertOrder(client, {
      user: session.user,
      status: "Paid",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      await transactionsRepo.removeFunds(
        session.user.id,
        orderPrices.pre_charges_amount,
        client
      );
      await transactionsRepo.addTransactionLog(
        session.user.id,
        "Debit",
        null,
        orderId,
        orderPrices.pre_charges_amount,
        client
      );
    }

    if (orderPrices.post_charges_amount > 0) {
      await stripeRepo.attachOrder(payment_intent_id, null, orderId, client);
    }

    await salesOrderRepo.insertItems(
      client,
      orderId,
      sales_order.items,
      spot_prices
    );

    await salesOrderRepo.insertOrderMetals(orderId, spot_prices, client);

    await client.query("COMMIT");

    const order = await getById(orderId);
    return order;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getById,
  listOrdersForUser,
  getAll,
  getMetalsForOrder,
  getItemsFromServer,
  createSalesOrder,
};
