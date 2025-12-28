import pool from "#db";
import * as purchaseOrderRepo from "#features/purchase-orders/repo.js";
import * as scrapRepo from "#features/scrap/repo.js";
import * as transactionRepo from "#features/transactions/repo.js";
import { calculateTotalPrice } from "#features/purchase-orders/utils/calculations.js";

import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as pickupRepo from "#features/shipping/pickups/repo.js";
import * as shippingOps from "#features/shipping/operations/handler.js";

import { DORADO_ADDRESS } from "#providers/fedex/constants.js";

export async function listOrdersForUser(userId) {
  return purchaseOrderRepo.findAllByUser(userId);
}

export async function getById(orderId) {
  return purchaseOrderRepo.findById(orderId);
}

export async function getAll() {
  return purchaseOrderRepo.getAll();
}

export async function getMetalsForOrder(orderId) {
  return purchaseOrderRepo.findMetalsByOrderId(orderId);
}

export async function acceptOffer({ order, order_spots, spot_prices }) {
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

    await purchaseOrderRepo.updateRefinerMetals(order.id, updatedSpots, client);

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

export async function rejectOffer({ orderId, offerNotes }) {
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

export async function cancelOrder({ order, return_shipment }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updatedOrder = await purchaseOrderRepo.cancelOrderById(
      order.id,
      client
    );
    await purchaseOrderRepo.clearOrderMetals(order.id, client);

    const shipment = await shipmentRepo.create(
      {
        purchase_order_id: order.id,
        // carrier_id: order.carrier.id,
        carrier_id: "30179428-b311-4873-8d08-382901c581d8",
        type: "Return",
      },
      client
    );

    const shipper = {
      contact: {
        personName: process.env.FEDEX_DORADO_NAME,
        phoneNumber: process.env.FEDEX_DORADO_PHONE_NUMBER,
      },
      address: DORADO_ADDRESS,
    };

    const recipient = {
      contact: {
        personName: return_shipment.address.name,
        phoneNumber: return_shipment.address.phone_number,
      },
      address: return_shipment.address,
    };

    const labelData = await shippingOps.createLabel(FEDEX_CARRIER_ID, client, {
      shipper,
      recipient,
      serviceType: return_shipment.service?.serviceType,
      pickupType: return_shipment.pickup?.label,
      pkg: {
        weight: return_shipment.package?.weight,
        dimensions: return_shipment.package?.dimensions,
      },
      insurance: {
        declaredValue: return_shipment.insurance?.declaredValue,
      },
    });

    const labelBuffer = Buffer.from(labelData.labelFile, "base64");

    const updatedShipment = await shipmentService.update(
      {
        ...shipment,
        tracking_number: labelData.tracking_number,
        carrier_id: FEDEX_CARRIER_ID,
        shipping_status: "Label Created",
        shipping_label: labelBuffer,
        label_type: "Generated",
        pickup_type: return_shipment.pickup?.name,
        package: return_shipment.package?.label,
        service_type: return_shipment.service?.serviceDescription,
        net_charge: return_shipment.service?.netCharge,
        insured: return_shipment.insurance?.insured,
        declared_value: return_shipment.insurance?.declaredValue?.amount,
        type: "Return",
      },
      client
    );

    await client.query("COMMIT");

    return { updatedOrder, returnShipment: updatedShipment };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateOfferNotes(order, offer_notes) {
  return purchaseOrderRepo.updateOfferNotes(order, offer_notes);
}

export async function createReview({ order }) {
  return purchaseOrderRepo.createReview({ order });
}

export async function createPurchaseOrder(purchase_order, user_id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const order_id = await purchaseOrderRepo.insertOrder(client, {
      userId: user_id,
      addressId: purchase_order.address.id,
      status: "In Transit",
    });

    await purchaseOrderRepo.insertItems(client, order_id, purchase_order.items);
    await purchaseOrderRepo.insertOrderMetals(client, order_id);
    await purchaseOrderRepo.insertRefinerMetals(client, order_id);

    await purchaseOrderRepo.insertPayout(client, order_id, {
      userId: user_id,
      ...purchase_order.payout,
    });

    const shipment = await shipmentRepo.create(
      {
        purchase_order_id: order_id,
        // carrier_id: purchase_order.carrier.id,
        carrier_id: "30179428-b311-4873-8d08-382901c581d8",
        type: "Inbound",
      },
      client
    );

    const shipper = {
      contact: {
        personName: purchase_order.address.name,
        phoneNumber: purchase_order.address.phone_number,
      },
      address: purchase_order.address,
    };

    const recipient = {
      contact: {
        personName: process.env.FEDEX_DORADO_NAME,
        phoneNumber: process.env.FEDEX_DORADO_PHONE_NUMBER,
      },
      address: DORADO_ADDRESS,
    };

    const labelData = await shippingOps.createLabel(
      // purchase_order.carrier.id,
      "30179428-b311-4873-8d08-382901c581d8",
      client,
      {
        shipper,
        recipient,
        serviceType: purchase_order.service?.serviceType,
        pickupType: purchase_order.pickup?.label,
        pkg: {
          weight: purchase_order.package?.weight,
          dimensions: purchase_order.package?.dimensions,
        },
        insurance: {
          declaredValue: purchase_order.insurance?.declaredValue,
        },
      }
    );

    const buffer = Buffer.from(labelData.labelFile, "base64");

    await shipmentRepo.update(
      {
        ...shipment,
        tracking_number: labelData.tracking_number,
        carrier_id: "30179428-b311-4873-8d08-382901c581d8",
        shipping_status: "Label Created",
        shipping_label: buffer,
        label_type: "Generated",
        pickup_type: purchase_order.pickup?.name ?? null,
        package: purchase_order.package?.label ?? null,
        service_type: purchase_order.service?.serviceDescription ?? null,
        net_charge: purchase_order.service?.netCharge ?? null,
        insured: purchase_order.insurance?.insured ?? false,
        declared_value: purchase_order.insurance?.declaredValue?.amount ?? null,
        type: "Inbound",
      },
      client
    );

    if (purchase_order.pickup?.name === "Carrier Pickup") {
      const pickupResult = await shippingOps.createPickup(
        FEDEX_CARRIER_ID,
        client,
        {
          pickupContact: {
            personName: addr.name,
            phoneNumber: addr.phone_number,
          },
          pickupAddress: purchase_order.address,
          pickupDate: purchase_order.pickup.date,
          pickupTime: purchase_order.pickup.time,
          carrierCode: purchase_order.service?.code ?? "FDXE",
          trackingNumber: labelData.tracking_number,
        }
      );

      await pickupRepo.create(
        {
          user_id,
          order_id: order_id,
          carrier: "FedEx",
          date: purchase_order.pickup.date,
          time: purchase_order.pickup.time,
          pickup_status: "scheduled",
          confirmation_number: pickupResult.confirmationNumber,
          location: pickupResult.location,
        },
        client
      );
    }

    await client.query("COMMIT");

    return await purchaseOrderRepo.findById(order_id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function sendOffer({ order, user_name }) {
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

export async function updateRejectedOffer({ order, order_status, user_name }) {
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

export async function updateStatus({ order, order_status, user_name }) {
  return await purchaseOrderRepo.updateStatus(order, order_status, user_name);
}

export async function updateSpot({ spot, updated_spot }) {
  return await purchaseOrderRepo.updateSpot({ spot, updated_spot });
}

export async function lockSpots({ spots, purchase_order_id }) {
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

export async function unlockSpots({ purchase_order_id }) {
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

export async function toggleOrderItemStatus({
  item_status,
  ids,
  purchase_order_id,
}) {
  return await purchaseOrderRepo.toggleOrderItemStatus({
    item_status: item_status,
    ids: ids,
    purchase_order_id: purchase_order_id,
  });
}

export async function updateScrapItem({ item }) {
  await scrapRepo.updateScrapItem({ item });
  return await purchaseOrderRepo.updatePremium(item.id, item.premium);
}

export async function deleteOrderItems({ items }) {
  const ids = items.map((item) => item.id);
  const scrapIds = items
    .map((item) => item.scrap?.id)
    .filter((id) => id !== null);
  await scrapRepo.deleteItems(scrapIds);
  return await purchaseOrderRepo.deleteOrderItems(ids);
}

export async function createOrderItem({ item, purchase_order_id }) {
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

export async function updateBullion({ item }) {
  return await purchaseOrderRepo.updateBullion(item);
}

export async function expireStaleOffers() {
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

export async function autoAcceptOrder(orderId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const spotPrices = await purchaseOrderRepo.getCurrentSpotPrices(client);

    const updatedSpots = await purchaseOrderRepo.updateOrderMetals(
      orderId,
      spotPrices,
      client
    );

    await purchaseOrderRepo.updateRefinerMetals(order.id, updatedSpots, client);

    const order = await purchaseOrderRepo.findById(orderId, client);

    await purchaseOrderRepo.updateOrderItemPrices(
      orderId,
      order.order_items,
      updatedSpots,
      client
    );

    const total = calculateTotalPrice(order, updatedSpots);

    await purchaseOrderRepo.moveOrderToAccepted(orderId, total, client);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[CRON] Failed to auto-accept order", orderId, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function editShippingCharge({ order_id, shipping_charge }) {
  return await purchaseOrderRepo.editShippingCharge(order_id, shipping_charge);
}

export async function editPayoutCharge({ order_id, payout_charge }) {
  return await purchaseOrderRepo.editPayoutCharge(order_id, payout_charge);
}

export async function addFundsToAccount({ order, spots }) {
  const client = await pool.connect();
  try {
    await transactionRepo.addFunds(order.user_id, order.total_price, client);
    await transactionRepo.addTransactionLog(
      order.user_id,
      "Credit",
      order.id,
      null,
      calculateTotalPrice(order, spots),
      client
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to move payments", order.id, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function changePayoutMethod({ order_id, method }) {
  return await purchaseOrderRepo.changePayoutMethod(order_id, method);
}

export async function purgeCancelled() {
  return await purchaseOrderRepo.purgeCancelled();
}

export async function getRefinerMetalsForOrder(orderId) {
  return purchaseOrderRepo.findRefinerMetalsByOrderId(orderId);
}

export async function updateRefinerSpot({ spot, updated_spot }) {
  return await purchaseOrderRepo.updateRefinerSpot({ spot, updated_spot });
}

export async function updateRefinerPremium({ item_id, refiner_premium }) {
  return await purchaseOrderRepo.updateRefinerPremium(item_id, refiner_premium);
}

export async function updateShippingActual({
  purchase_order_id,
  shipping_fee_actual,
}) {
  return await purchaseOrderRepo.updateShippingActual(
    purchase_order_id,
    shipping_fee_actual
  );
}

export async function updateRefinerFee({ purchase_order_id, refiner_fee }) {
  return await purchaseOrderRepo.updateRefinerFee(
    purchase_order_id,
    refiner_fee
  );
}

export async function updatePoolOzDeducted({
  purchase_order_id,
  pool_oz_deducted,
}) {
  return await purchaseOrderRepo.updatePoolOzDeducted(
    purchase_order_id,
    pool_oz_deducted
  );
}
export async function updatePoolRemediation({
  purchase_order_id,
  pool_remediation,
}) {
  return await purchaseOrderRepo.updatePoolRemediation(
    purchase_order_id,
    pool_remediation
  );
}
