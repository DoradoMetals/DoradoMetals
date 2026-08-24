import withTransaction from "#shared/db/withTransaction.js";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as trackingRepo from "#features/shipping/tracking/repo.js";
import * as pickupRepo from "#features/shipping/pickups/repo.js";
import * as shippingHandler from "#features/shipping/operations/handler.js";
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from "#providers/fedex/constants.js";

// Cancelling a label held a transaction open across the FedEx call, so a
// failure in the update that follows rolled the row back with the label already
// dead at FedEx - the customer prints a label the system says is active and it
// is refused at the counter.
//
// A cancel is idempotent, which is what makes this the easy half of the rule:
// the external call can happen first, outside any transaction, and a retry
// simply cancels an already-cancelled label. Nothing needs to be undone, and
// the failure mode left is "FedEx cancelled, we did not record it", which the
// same request fixes when it is run again.
//
// Creating a label is not idempotent and does not get this treatment; see
// features/purchase-orders/service.js.
export async function cancelLabel({ shipment_id, carrier_id }) {
  const shipment = await shipmentRepo.getById(shipment_id);

  await shippingHandler.cancelLabel(carrier_id, undefined, {
    trackingNumber: shipment.tracking_number,
  });

  return await shipmentRepo.update({
    ...shipment,
    shipping_status: "Cancelled",
  });
}

export async function getTracking(shipment_id) {
  return withTransaction(async (client) => {
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

    return await trackingRepo.getEvents(shipment_id, client);
  });
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

// Same shape as cancelLabel, and the same reasoning: cancelling a pickup is
// idempotent, so it happens outside any transaction and a retry is harmless.
// Rolling back after it would have left a courier who is not coming and a row
// that says one is.
export async function cancelPickup({ pickup_id, carrier_id }) {
  const pickup = await pickupRepo.getById(pickup_id);

  await shippingHandler.cancelPickup(carrier_id, undefined, {
    confirmationCode: pickup.confirmation_number,
    pickupDate: pickup.pickup_requested_at,
    location: pickup.location,
  });

  // Two things were wrong here. The repo reads pickup_status, so `status`
  // wrote the row's existing status straight back; and exchange.carrier_pickups
  // has a CHECK constraint allowing only pending / scheduled / completed /
  // canceled - one l - so "cancelled" is refused outright.
  return await pickupRepo.update({
    ...pickup,
    pickup_status: "canceled",
  });
}
