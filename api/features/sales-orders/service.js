import withTransaction from "#shared/db/withTransaction.js";
import { auth } from "#features/auth/client.js";
import { fromNodeHeaders } from "better-auth/node";

import * as salesOrderRepo from "#features/sales-orders/repo.js";
import * as stripeRepo from "#features/payments/repo.js";
import * as transactionsRepo from "#features/transactions/repo.js";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as refinerRepo from "#features/refiners/repo.js";
import * as taxRepo from "#features/sales-tax/repo.js";

import * as emailService from "#features/emails/service.ts";
import * as addressService from "#features/addresses/service.ts";
import * as taxService from "#features/sales-tax/service.ts";
import * as spotsService from "#features/spots/service.ts";
import * as productService from "#features/products/service.ts";

import { calculateSalesOrderTotal } from "#features/sales-orders/utils/calculations.ts";

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

// SPOT PRICES COME FROM THE SERVER, NOT FROM THE BODY.
//
// `spot_prices` used to arrive in the request and decide what the order was
// worth. Items were already re-fetched with getItemsFromServer and the address
// loaded by id, so the product could not be faked - but the price of the metal
// could, and it is the larger number. An order priced with ask_spot 1 recorded
// a total of $26.81 for an ounce of gold, and the payment intent agreed with
// it, so nothing downstream looked wrong.
//
// The order is now priced at what the business holds at the moment it is
// placed. That is a real behaviour change and worth knowing: if spot moves
// between the customer loading the page and confirming, the recorded total is
// the newer one. A quote held for a few minutes is the proper answer and is
// written up in FOLLOWUPS; it needs a table, and the schema is mid-migration.
// THE ADDRESS IS A ROW, NOT A LIST OF THEM.
//
// This read `addressRepo.getFromId(...)`, which returns `rows`, and then took
// `.state` off it - which on an array is `undefined`. Both uses below are the
// taxing state: one decides what the customer is charged, the other credits
// the state's liability. Taxed in no state at all, the rules match nothing and
// COALESCE to a rate of zero, silently.
//
// It arrived in cf724c4e, "fix sales order bug", 6 January 2026, which replaced
// addressService.getAddressFromId - deleted in the December feature-slicing -
// with the repo call. The same deletion left update_payment_intent answering
// 500 for eight months (cf5a94eb). One call site was left broken; this one was
// "fixed" into something quieter.
//
// features/sales-orders/address-state.test.js proves both halves.
export async function createSalesOrder({ sales_order, payment_intent_id }, headers) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const address = await addressService.getAddressFromId(sales_order.address.id);
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  const spot_prices = await spotsService.getPricingSpots();
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );
  const orderId = await withTransaction(async (client) => {
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

    return orderId;
  });

  return await getById(orderId);
}

export async function adminCreateSalesOrder({
  sales_order,
  payment_intent_id,
  user,
}) {
  const address = await addressService.getAddressFromId(sales_order.address.id);
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  // Server-sourced here too. An admin placing an order on a customer's behalf
  // is still an order, and the same argument applies - more so, since this path
  // has no Stripe confirmation to disagree with it.
  const spot_prices = await spotsService.getPricingSpots();
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );
  const orderId = await withTransaction(async (client) => {
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

    return orderId;
  });

  return await getById(orderId);
}

export async function updateStatus({ order, order_status, user_name }) {
  return await salesOrderRepo.updateStatus(order, order_status, user_name);
}

// `transport` is a separate parameter, not a field on the input object, for the
// reason features/emails/service.ts gives: the controller hands req.body
// straight to this function, so a field would be reachable from the request.
// Nothing in production passes one; a test passes a recorder, which is what
// makes the guard below testable without mail leaving the building.
export async function sendOrderToSupplier({ order, spots, supplier_id }, transport) {
  const sales_order = await getById(order.id);
  const supplier = await refinerRepo.getRefinerFromId(supplier_id);

  // An order with no address cannot be sent to a refiner: the whole point of
  // the message is telling them where to ship the metal.
  //
  // This was found by typing renderEmail. SalesOrderWire declares
  // `address: AddressOnOrder.nullable()` and production means it - sales order
  // 55 has address_id NULL - so the renderer threw a TypeError on
  // `addr.line_1`. It threw *after* the transaction below, which is where the
  // comment on that transaction says the acceptable failure lives: an order
  // marked sent whose email did not arrive. That is only acceptable when it is
  // visible. A refuse here makes it visible, and makes it a no-op: nothing is
  // attached, no shipment is created, order_sent stays false, and the admin
  // gets a message saying which order and why.
  if (!sales_order.address) {
    throw new Error(
      `Sales order ${sales_order.order_number} has no address, so it cannot be sent to a supplier`
    );
  }

  // The record first, the email second.
  //
  // The send used to be the first statement inside this transaction, so if any
  // of the three writes below failed the transaction rolled back and the
  // refiner had already been sent the order and its invoice. For a sales order
  // that means they ship metal to the customer - against an order with no
  // supplier attached, no outbound shipment and no record of having been sent.
  //
  // Both orderings can fail; they are not equally bad. This way the worst case
  // is an order marked sent whose email did not arrive, which nobody acts on
  // and an admin can resend. The other way round, metal leaves the building
  // against a record that was rolled back.
  await withTransaction(async (client) => {
    await salesOrderRepo.attachSupplierToOrder(
      sales_order.id,
      supplier_id,
      client
    );

    await shipmentRepo.create(
      { sales_order_id: sales_order.id, type: "Outbound" },
      client
    );

    await salesOrderRepo.updateOrderSent(sales_order.id, client);
  });

  await emailService.sendSalesOrderToSupplier(
    sales_order,
    spots,
    supplier.email,
    transport
  );

  return await getById(sales_order.id);
}

export async function updateTracking({
  order_id,
  shipment_id,
  tracking_number,
  carrier_id,
}) {
  // THIS AWAITED shipmentRepo.insertTrackingNumber, WHICH DOES NOT EXIST.
  //
  // The shipments repo exports getAll, getById, getByOrder, create, update and
  // remove, and never had an insertTrackingNumber - checked against master,
  // which is what auto-deploys, as well as here. `import * as` makes a missing
  // name `undefined` rather than an import error, so
  // POST /api/sales_orders/update_tracking answered 500 on every call: an admin
  // could not record a tracking number against a sales order at all.
  //
  // Read-then-update is the pattern this codebase already uses for the same
  // shape of change - see cancelLabel in features/shipping/operations/service.ts,
  // which spreads the shipment and overrides one field. Going through
  // shipmentRepo.update also means the write follows the SHIPMENTS_SOURCE switch
  // and its dual-write, which a bespoke UPDATE here would have bypassed.
  const shipment = await shipmentRepo.getById(shipment_id);
  if (!shipment) {
    const err = new Error(`no shipment ${shipment_id}`);
    err.statusCode = 404;
    throw err;
  }

  await shipmentRepo.update({
    ...shipment,
    tracking_number,
    carrier_id,
  });
  return await salesOrderRepo.updateTrackingStatus(order_id);
}

export async function createReview({ order }) {
  return salesOrderRepo.createReview({ order });
}
