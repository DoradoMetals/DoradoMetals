const pool = require("../db");
const purchaseOrderRepo = require("../repositories/purchaseOrdersRepo");
const shippingRepo = require("../repositories/shippingRepo");
const scrapRepo = require("../repositories/scrapRepo");
const transactionRepo = require("../repositories/transactionRepo");

const {
  createFedexLabel,
  formatAddressForFedEx,
} = require("../controllers/shipping/fedexController");

const { calculateTotalPrice } = require("../utils/price-calculations");

async function listOrdersForUser(userId) {
  return purchaseOrderRepo.findAllByUser(userId);
}

async function getById(orderId) {
  return purchaseOrderRepo.findById(orderId);
}

async function getAll() {
  return purchaseOrderRepo.getAll();
}

async function getMetalsForOrder(orderId) {
  return purchaseOrderRepo.findMetalsByOrderId(orderId);
}

async function acceptOffer({ order, order_spots, spot_prices }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let updatedSpots = order.spots_locked
      ? order_spots
      : await purchaseOrderRepo.updateOrderMetals(
          order.id,
          spot_prices,
          client
        );

    await purchaseOrderRepo.updateOrderItemPrices(
      order.id,
      order.order_items,
      updatedSpots,
      client
    );

    const total = calculateTotalPrice(order, updatedSpots);
    await purchaseOrderRepo.moveOrderToAccepted(order.id, total, client);

    if (order.payout.method === "DORADO_ACCOUNT") {
      await transactionRepo.addFunds(order.user_id, total, client);
      await transactionRepo.addTransactionLog(
        order.user_id,
        "Credit",
        order.id,
        null,
        total,
        client
      );
    }

    await client.query("COMMIT");
    const purchaseOrder = await getById(order.id);
    return { purchaseOrder, orderSpots: updatedSpots };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function rejectOffer({ orderId, offerNotes }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await getById(orderId);

    const updatedOrder = await purchaseOrderRepo.rejectOfferById(
      orderId,
      offerNotes,
      client
    );

    await client.query("COMMIT");
    return updatedOrder;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function cancelOrder({ order, return_shipment }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updatedOrder = await purchaseOrderRepo.cancelOrderById(
      order.id,
      client
    );

    await purchaseOrderRepo.clearOrderMetals(order.id, client);

    const labelData = await createFedexLabel(
      return_shipment.address.name,
      return_shipment.address.phone_number,
      formatAddressForFedEx(return_shipment.address),
      "Return",
      {
        weight: return_shipment.package.weight,
        dimensions: return_shipment.package.dimensions,
        insured: return_shipment.insurance.declaredValue,
      },
      return_shipment.pickup?.label || "DROPOFF_AT_FEDEX_LOCATION",
      return_shipment.service?.serviceType || "FEDEX_EXPRESS_SAVER",
      return_shipment.declaredValue
    );
    const labelBuffer = Buffer.from(labelData.labelFile, "base64");

    const insertedShipment = await purchaseOrderRepo.insertReturnShipment(
      order.id,
      {
        tracking_number: labelData.tracking_number,
        pickup: return_shipment.pickup,
        package: return_shipment.package,
        service: return_shipment.service,
        insurance: return_shipment.insurance,
      },
      labelBuffer,
      client
    );

    await client.query("COMMIT");

    return { updatedOrder, returnShipment: insertedShipment };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateOfferNotes(order, offer_notes) {
  return purchaseOrderRepo.updateOfferNotes(order, offer_notes);
}

async function createReview(order) {
  return purchaseOrderRepo.createReview(order);
}

async function createPurchaseOrder(purchase_order, user_id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderId = await purchaseOrderRepo.insertOrder(client, {
      userId: user_id,
      addressId: purchase_order.address.id,
      status: "In Transit",
    });
    await purchaseOrderRepo.insertItems(client, orderId, purchase_order.items);
    await purchaseOrderRepo.insertOrderMetals(client, orderId);
    await purchaseOrderRepo.insertPayout(client, orderId, {
      userId: user_id,
      ...purchase_order.payout,
    });

    const labelData = await createFedexLabel(
      purchase_order.address.name,
      purchase_order.address.phone_number,
      formatAddressForFedEx(purchase_order.address),
      "Inbound",
      {
        weight: purchase_order.package.weight,
        dimensions: purchase_order.package.dimensions,
        insured: purchase_order.insurance.insured,
      },
      purchase_order.pickup?.label,
      purchase_order.service?.serviceType,
      purchase_order.insurance.declaredValue
    );

    const buffer = Buffer.from(labelData.labelFile, "base64");
    await shippingRepo.insertShipment(
      orderId,
      null,
      labelData.tracking_number,
      "30179428-b311-4873-8d08-382901c581d8",
      "Label Created",
      buffer,
      "Generated",
      purchase_order.pickup.name,
      purchase_order.package.label,
      purchase_order.service.serviceDescription,
      purchase_order.service.netCharge,
      purchase_order.insurance.insured,
      purchase_order.insurance.declaredValue.amount,
      "Inbound",
      client
    );

    if (purchase_order.pickup?.name === "Carrier Pickup") {
      const { confirmationNumber, location } = await scheduleFedexPickup(
        purchase_order.address.name,
        purchase_order.address.phone_number,
        formatAddressForFedEx(purchase_order.address),
        purchase_order.pickup.date,
        purchase_order.pickup.time,
        purchase_order.service.code,
        labelData.tracking_number
      );
      await shippingRepo.insertPickup(client, orderId, user_id, {
        confirmationNumber,
        location,
        date: purchase_order.pickup.date,
        time: purchase_order.pickup.time,
      });
    }

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

async function sendOffer({ order, order_status, user_name }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await purchaseOrderRepo.clearItemPrices(client, order.id);
    await purchaseOrderRepo.resetOrderTotal(client, order.id);

    const now = new Date();
    const sentAt = now;
    const expiresAt = order.spots_locked
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const updated = await purchaseOrderRepo.updateOffer(client, {
      orderId: order.id,
      sentAt,
      expiresAt,
      offerStatus: "Sent",
      updated_by: user_name,
    });

    if (!updated) {
      await client.query("ROLLBACK");
      const e = new Error("Purchase Order not found");
      e.status = 404;
      throw e;
    }

    await client.query("COMMIT");

    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateRejectedOffer({ order, order_status, user_name }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await purchaseOrderRepo.clearItemPrices(client, order.id);
    await purchaseOrderRepo.resetOrderTotal(client, order.id);

    const now = new Date();
    const sentAt = now;
    const expiresAt = order.spots_locked
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const updated = await purchaseOrderRepo.updateOffer(client, {
      orderId: order.id,
      sentAt: order.offer_status === "Resent" ? null : sentAt,
      expiresAt: order.offer_status === "Resent" ? null : expiresAt,
      offerStatus: order.offer_status === "Resent" ? "Rejected" : "Resent",
      updated_by: user_name,
    });

    if (!updated) {
      await client.query("ROLLBACK");
      const e = new Error("Purchase Order not found");
      e.status = 404;
      throw e;
    }

    await client.query("COMMIT");

    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateStatus({ order, order_status, user_name }) {
  return await purchaseOrderRepo.updateStatus(order, order_status, user_name);
}

async function updateScrap({ spot, scrap_percentage }) {
  return await purchaseOrderRepo.updateScrapPercentage(spot, scrap_percentage);
}

async function resetScrap({ spot }) {
  return await purchaseOrderRepo.resetScrapPercentage(spot);
}

async function updateSpot({ spot, updated_spot }) {
  return await purchaseOrderRepo.updateSpot({ spot, updated_spot });
}

async function lockSpots({ spots, purchase_order_id }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await purchaseOrderRepo.toggleSpots(true, purchase_order_id, client);
    const updated = purchaseOrderRepo.updateOrderMetals(
      purchase_order_id,
      spots,
      client
    );

    await client.query("COMMIT");

    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function unlockSpots({ purchase_order_id }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await purchaseOrderRepo.toggleSpots(false, purchase_order_id, client);
    const updated = purchaseOrderRepo.clearOrderMetals(
      purchase_order_id,
      client
    );

    await client.query("COMMIT");

    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function toggleOrderItemStatus({ item_status, ids, purchase_order_id }) {
  return await purchaseOrderRepo.toggleOrderItemStatus({
    item_status: item_status,
    ids: ids,
    purchase_order_id: purchase_order_id,
  });
}

async function updateScrapItem({ item }) {
  return await scrapRepo.updateScrapItem({ item });
}

async function deleteOrderItems({ items }) {
  const ids = items.map((item) => item.id);
  const scrapIds = items
    .map((item) => item.scrap?.id)
    .filter((id) => id !== null);
  await scrapRepo.deleteItems(scrapIds);
  return await purchaseOrderRepo.deleteOrderItems(ids);
}

async function createOrderItem({ item, purchase_order_id }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let scrap_id = null;
    if (!item?.id) {
      scrap_id = await scrapRepo.createNewItem(item, client);
    }

    const updated = purchaseOrderRepo.createOrderItem(
      item,
      purchase_order_id,
      scrap_id,
      client
    );

    await client.query("COMMIT");

    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateBullion({ item }) {
  return await purchaseOrderRepo.updateBullion(item);
}

async function expireStaleOffers() {
  const expiredOrders = await purchaseOrderRepo.findExpiredOffers();

  for (const order of expiredOrders) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (order.spots_locked) {
        const newSentAt = new Date();
        const newExpiresAt = new Date(
          newSentAt.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        await purchaseOrderRepo.toggleSpots(false, order.id, client);

        await purchaseOrderRepo.updateOffer(client, {
          orderId: order.id,
          sentAt: newSentAt,
          expiresAt: newExpiresAt,
          offerStatus: "Sent",
          updated_by: "Scheduler",
        });

        await purchaseOrderRepo.clearOrderMetals(order.id, client);
      } else {
        await autoAcceptOrder(order.id);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[CRON] Error expiring offer:", order.id, err);
    } finally {
      client.release();
    }
  }
}

async function autoAcceptOrder(orderId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const spotPrices = await purchaseOrderRepo.getCurrentSpotPrices(client);

    const updatedSpots = await purchaseOrderRepo.updateOrderMetals(
      orderId,
      spotPrices,
      client
    );

    const order = await purchaseOrderRepo.findById(orderId, client);

    await purchaseOrderRepo.updateOrderItemPrices(
      orderId,
      order.order_items,
      updatedSpots,
      client
    );

    const total = calculateTotalPrice(order, updatedSpots);

    await purchaseOrderRepo.moveOrderToAccepted(orderId, total, client);

    if (order.payout.method === "DORADO_ACCOUNT") {
      await transactionRepo.addFunds(order.user_id, total, client);
      await transactionRepo.addTransactionLog(
        order.user_id,
        "Credit",
        orderId,
        null,
        total,
        client
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[CRON] Failed to auto-accept order", orderId, err);
    throw err;
  } finally {
    client.release();
  }
}

async function editShippingCharge({order_id, shipping_charge}) {
  return await purchaseOrderRepo.editShippingCharge(order_id, shipping_charge)
}

async function editPayoutCharge({order_id, payout_charge}) {
  return await purchaseOrderRepo.editPayoutCharge(order_id, payout_charge)
}

module.exports = {
  listOrdersForUser,
  getById,
  getAll,
  getMetalsForOrder,
  acceptOffer,
  rejectOffer,
  cancelOrder,
  updateOfferNotes,
  createReview,
  createPurchaseOrder,
  sendOffer,
  updateStatus,
  updateRejectedOffer,
  updateScrap,
  resetScrap,
  updateSpot,
  lockSpots,
  unlockSpots,
  toggleOrderItemStatus,
  updateScrapItem,
  deleteOrderItems,
  createOrderItem,
  updateBullion,
  expireStaleOffers,
  autoAcceptOrder,
  editShippingCharge,
  editPayoutCharge,
};
