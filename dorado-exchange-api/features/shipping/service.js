import pool from "#db";
import * as shippingRepo from "#features/shipping/repo.js"
import { getFedexShipmentTracking } from "#features/fedex/controller.js"

export async function getTracking({
  tracking_number,
  shipment_id,
  carrier_id,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const carrier = await shippingRepo.getCarrier(carrier_id, client);

    let trackingInfo = {};

    if (carrier === "FedEx") {
      trackingInfo = await getFedexShipmentTracking(tracking_number);
    } else {
      // TODO: UPS tracking
      await client.query("ROLLBACK");
      return [];
    }

    await shippingRepo.deleteTrackingEvents(shipment_id, client);
    await shippingRepo.insertTrackingEvents(trackingInfo, shipment_id, client);
    await shippingRepo.updateStatus(trackingInfo, shipment_id, client);

    await client.query("COMMIT");
    return await shippingRepo.getTrackingEvents(shipment_id, client);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
