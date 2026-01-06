import pool from "#db";
import { auth } from "#features/auth/client.js";
import { fromNodeHeaders } from "better-auth/node";

import * as salesOrderRepo from "#features/sales-orders/repo.js";
import * as stripeRepo from "#features/stripe/repo.js";
import * as transactionsRepo from "#features/transactions/repo.js";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as supplierRepo from "#features/suppliers/repo.js";
import * as taxRepo from "#features/sales-tax/repo.js";

import * as emailService from "#features/emails/service.js";
import * as addressRepo from "#features/addresses/repo.js";
import * as taxService from "#features/sales-tax/service.js";
import * as productService from "#features/products/service.js";

import { calculateSalesOrderTotal } from "#features/sales-orders/utils/calculations.js";

export async function getById(orderId) {
  return salesOrderRepo.findById(orderId);
}

export async function listOrdersForUser(userId) {
  return salesOrderRepo.findAllByUser(userId);
}

export async function getAll() {
  return salesOrderRepo.getAll();
}

export async function getMetalsForOrder(orderId) {
  return salesOrderRepo.findMetalsByOrderId(orderId);
}

export async function createSalesOrder(
  { sales_order, payment_intent_id, spot_prices },
  headers
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const address = await addressRepo.getFromId(sales_order.address.id);
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
      status: sales_order.payment_method === "CREDIT" ? "Preparing" : "Pending",
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

    return await getById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function adminCreateSalesOrder({
  sales_order,
  payment_intent_id,
  spot_prices,
  user,
}) {
  const address = await addressRepo.getFromId(sales_order.address.id);
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
      user,
      sales_order.service.value,
      sales_order.payment_method
    );

    const orderId = await salesOrderRepo.insertOrder(client, {
      user: user,
      status: sales_order.payment_method === "CREDIT" ? "Preparing" : "Pending",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      await transactionsRepo.removeFunds(
        user.id,
        orderPrices.pre_charges_amount,
        client
      );
      await transactionsRepo.addTransactionLog(
        user.id,
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

    return await getById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateStatus({ order, order_status, user_name }) {
  return await salesOrderRepo.updateStatus(order, order_status, user_name);
}

export async function sendOrderToSupplier({ order, spots, supplier_id }) {
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

    await shipmentRepo.insertShipment(
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

export async function updateTracking({
  order_id,
  shipment_id,
  tracking_number,
  carrier_id,
}) {
  await shipmentRepo.insertTrackingNumber(
    shipment_id,
    tracking_number,
    carrier_id
  );
  return await salesOrderRepo.updateTrackingStatus(order_id);
}

export async function createReview({ order }) {
  return salesOrderRepo.createReview({ order });
}
