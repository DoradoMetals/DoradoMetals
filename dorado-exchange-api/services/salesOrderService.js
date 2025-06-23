const pool = require("../db");
const { auth } = require("../auth");
const { fromNodeHeaders } = require("better-auth/node");

const salesOrderRepo = require("../repositories/salesOrderRepo");
const stripeRepo = require("../repositories/stripeRepo");
const transactionsRepo = require("../repositories/transactionRepo");
const shippingRepo = require("../repositories/shippingRepo");
const supplierRepo = require("../repositories/supplierRepo");
const taxRepo = require("../repositories/taxRepo");

const emailService = require("../services/emailService");
const addressService = require("../services/addressService");
const taxService = require("../services/taxService");
const stripeService = require("../services/stripeService");
const productService = require("../services/productService");

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

async function createSalesOrder(
  { sales_order, payment_intent_id, spot_prices },
  headers
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const address = await addressService.getAddressFromId(sales_order.address.id);
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );
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
      status: "Pending",
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

    await salesOrderRepo.insertItems(client, orderId, items, spot_prices);

    await salesOrderRepo.insertOrderMetals(orderId, spot_prices, client);

    await taxRepo.updateStateSalesTax(
      orderPrices.sales_tax,
      address.state,
      client
    );

    if (orderPrices.post_charges_amount > 0) {
      await stripeRepo.attachOrder(payment_intent_id, null, orderId, client);
    }
    await client.query("COMMIT");

    if (orderPrices.post_charges_amount > 0) {
      await stripeService.capturePaymentIntent(payment_intent_id);
    }

    return await getById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateStatus({ order, order_status, user_name }) {
  return await salesOrderRepo.updateStatus(order, order_status, user_name);
}

async function sendOrderToSupplier({ order, spots, supplier_id }) {
  const client = await pool.connect();

  const sales_order = await getById(order.id);
  const supplier = await supplierRepo.getSupplierFromId(supplier_id);

  try {
    await client.query("BEGIN");

    await emailService.sendSalesOrderToSupplier(
      sales_order,
      spots,
      supplier.email
    );

    await salesOrderRepo.attachSupplierToOrder(
      sales_order.id,
      supplier_id,
      client
    );

    await shippingRepo.insertShipment(
      null,
      sales_order.id,
      null,
      null,
      "Label Created",
      null,
      "Generated",
      "DropShip",
      "Small Box",
      sales_order.shipping_service,
      sales_order.shipping_cost,
      true,
      sales_order.item_total,
      "Outbound",
      client
    );

    await salesOrderRepo.updateOrderSent(sales_order.id, client);

    await client.query("COMMIT");
    return await getById(sales_order.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateTracking({
  order_id,
  shipment_id,
  tracking_number,
  carrier_id,
}) {
  await shippingRepo.insertTracking(shipment_id, tracking_number, carrier_id);
  return await salesOrderRepo.updateTracking(order_id);
}

module.exports = {
  getById,
  listOrdersForUser,
  getAll,
  getMetalsForOrder,
  createSalesOrder,
  updateStatus,
  sendOrderToSupplier,
  updateTracking,
};
