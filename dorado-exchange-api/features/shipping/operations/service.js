import pool from "#db";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as trackingRepo from "#features/shipping/tracking/repo.js";
import * as pickupRepo from "#features/shipping/pickups/repo.js";
import * as shippingHandler from "#features/shipping/operations/handler.js";
import { FEDEX_STORE_ADDRESS } from "#providers/fedex/constants.js";

export async function cancelLabel({ shipment_id, carrier_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const shipment = await shipmentRepo.getById(shipment_id, client);
    console.log(shipment);

    await shippingHandler.cancelLabel(carrier_id, client, {
      trackingNumber: shipment.tracking_number,
    });

    const updated = await shipmentRepo.update(
      {
        ...shipment,
        shipping_status: "Cancelled",
      },
      client
    );

    await client.query("COMMIT");
    return updated;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getTracking(shipment_id) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const shipment = await shipmentRepo.getById(shipment_id, client);

    const trackingInfo = await shippingHandler.getTracking(
      shipment.carrier_id,
      client,
      {
        tracking_number: shipment.tracking_number,
      }
    );

    await trackingRepo.removeEvents(shipment_id, client);
    await trackingRepo.insertEvents(trackingInfo, shipment_id, client);

    await shipmentRepo.update(
      {
        ...shipment,
        shipping_status: trackingInfo.latestStatus ?? shipment.shipping_status,
        estimated_delivery:
          trackingInfo.estimatedDeliveryTime === "TBD"
            ? null
            : trackingInfo.estimatedDeliveryTime,
        delivered_at: trackingInfo.deliveredAt,
      },
      client
    );

    await client.query("COMMIT");
    return await trackingRepo.getEvents(shipment_id, client);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getRates({
  carrier_id,
  shippingType,
  address,
  pkg,
  pickupType,
  declaredValue,
}) {
  let shipperAddress;
  let recipientAddress;

  switch (shippingType) {
    case "Inbound":
      shipperAddress = address;
      recipientAddress = FEDEX_STORE_ADDRESS;
      break;
    case "Outbound":
      shipperAddress = DORADO_ADDRESS;
      recipientAddress = address;
      break;
    case "Return":
      shipperAddress = DORADO_ADDRESS;
      recipientAddress = address;
      break;

    default:
      throw new Error(`Invalid shippingType: ${shippingType}`);
  }
  return shippingHandler.getRates(carrier_id, null, {
    shipperAddress,
    recipientAddress,
    pkg,
    pickupType,
    declaredValue,
  });
}

export async function cancelPickup({ pickup_id, carrier_id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pickup = await pickupRepo.getById(pickup_id, client);

    await shippingHandler.cancelPickup(carrier_id, client, {
      confirmationCode: pickup.confirmation_number,
      pickupDate: pickup.pickup_requested_at,
      location: pickup.location,
    });

    const updated = await pickupRepo.update(
      {
        ...pickup,
        status: "cancelled",
      },
      client
    );

    await client.query("COMMIT");
    return updated;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
