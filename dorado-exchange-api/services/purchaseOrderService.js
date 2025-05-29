const pool = require("../db");
const purchaseOrderRepo = require("../repositories/purchaseOrdersRepository");
const shippingRepo = require("../repositories/shippingRepository");

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
      client,
      orderId,
      "inbound",
      {
        ...labelData,
        pickup: purchase_order.pickup,
        package: purchase_order.package,
        service: purchase_order.service,
        insurance: purchase_order.insurance,
      },
      buffer
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
};
