import withTransaction from "#shared/db/withTransaction.ts";
// The SERVICE, not a repo: shipments carries the order-link and read-modify-
// write helpers (getOrderLink, patch) alongside the bare CRUD.
import * as shipmentRepo from "#domain/shipping/shipments/service.ts";
import * as trackingRepo from "#domain/shipping/tracking/service.ts";
// The SERVICE, not a repo: a pickup hangs off a SHIPMENT.
import * as pickupRepo from "#domain/shipping/pickups/service.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as shippingHandler from "#domain/shipping/operations/handler.ts";
import { carrierIdOr } from "#domain/shipping/operations/resolver.ts";
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from "#providers/shipments/constants.ts";
import type { ShipmentBaseRow as ShipmentRow } from "#db/shipping/shipments/repo.ts";
import type { TrackedShipment as TrackingRow } from "#domain/shipping/tracking/service.ts";
import type { ParsedTracking } from "#providers/shipments/utils/parsing.ts";
import type { RatesInput } from "#domain/shipping/operations/handler.ts";
import type { PickupBaseRow as PickupRow } from "#db/shipping/pickups/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

// fetchTracking is the seam a test uses instead of calling FedEx. Returns ParsedTracking, not TrackingInfo: this reads four fields (scanEvents, latestStatus, estimatedDeliveryTime, deliveredAt), and TrackingInfo declares only the one insertEvents needs - the narrower type would compile then fail at the body.
import type { shipping } from "@dorado/contracts";

export type FetchTracking = (
  shipment: ShipmentRow,
  client?: Executor
) => Promise<ParsedTracking>;

// The three directions a parcel moves, read from shipping.direction itself rather than duplicated by hand - not to be confused with orders.direction (purchase/sale), a different enum with the same name.
type ShippingType = shipping.ShipmentsRow["direction"];

// Runs OUTSIDE any transaction: cancelling a label first, inside one, risked a later failure rolling back our record while FedEx had already killed the label - a customer holding a label the system still calls active.
// Safe because cancel is idempotent - a retry just cancels an already-cancelled label. Creating a label is NOT idempotent and doesn't get this treatment; see domain/orders/service.ts.
export async function cancelLabel({
  shipment_id,
  carrier_id,
}: {
  shipment_id: string;
  carrier_id?: string | null;
}): Promise<ShipmentRow | null> {
  // An unknown shipment id used to reach the carrier before this guard existed - getById returning null meant a TypeError AFTER deciding to call FedEx, not before.
  const shipment = await shipmentRepo.getById(shipment_id);
  if (!shipment) {
    const err: Error & { statusCode?: number } = new Error(
      `no shipment ${shipment_id} to cancel`
    );
    err.statusCode = 404;
    throw err;
  }

  await shippingHandler.cancelLabel(await carrierIdOr(carrier_id), undefined, {
    trackingNumber: shipment.tracking_number,
  });

  // patch(), not update(): preserves carrier_service_id/package_id verbatim and only changes the status.
  return await shipmentRepo.patch(shipment.id, { shipping_status: "Cancelled" });
}

// fetchTracking is a separate parameter, not a request field - the controller only ever passes shipment_id, so nothing in production could reach it. Tests inject a function instead of calling FedEx; FEDEX_ENV=sandbox is for a human smoke test, never a test dependency.
// Returns the shipment's tracking EVENTS, not the shipment - even on the early return, so "nothing recognised" looks the same as "nothing changed".
function requireCarrier(carrier_id: string | null, shipment_id: string): string {
  if (!carrier_id) {
    const err: Error & { statusCode?: number } = new Error(
      `shipment ${shipment_id} has no carrier - it has no service, so no label ` +
        `has been bought for it yet`
    );
    err.statusCode = 409;
    throw err;
  }
  return carrier_id;
}

export async function getTracking(
  shipment_id: string,
  fetchTracking?: FetchTracking
): Promise<TrackingRow | null> {
  return withTransaction(async (client) => {
    const shipment = await shipmentRepo.getById(shipment_id, client);
    // Same guard as cancelLabel: an unknown id used to read off null after opening a transaction, before reaching the carrier.
    if (!shipment) {
      const err: Error & { statusCode?: number } = new Error(
        `no shipment ${shipment_id} to track`
      );
      err.statusCode = 404;
      throw err;
    }

    // carrier_id comes through the shipment's service - a shipment with no service yet (a shell, before its label) has none.
    const service = shipment.carrier_service_id
      ? await servicesRepo.getOne(shipment.carrier_service_id, client)
      : undefined;

    const trackingInfo = fetchTracking
      ? await fetchTracking(shipment, client)
      : await shippingHandler.getTracking(
          // There is no carrier to ask, and asking `undefined` would have
          // reached the provider registry as "Unsupported carrier: ".
          requireCarrier(service?.carrier_id ?? null, shipment_id),
          client,
          { tracking_number: shipment.tracking_number }
        );

    // A refresh that recognizes nothing is not news - it used to be treated as news that everything is gone: removeEvents is an unconditional DELETE, so an unrecognized response (parseTracking's placeholder strings, which `??` never catches) deleted a shipment's whole tracking history and wrote back "Status Unknown" or a nulled estimate/delivered_at.
    // It already happened: production has four shipments at "Status Unknown" with zero events and three at "Delivered" with zero - only this function ever writes those two statuses, so they had events when marked and don't now.
    // Nothing here is authoritative - FedEx is, and a later good refresh replaces the lot. Keeping what's known beats replacing it with a placeholder, so an unrecognized response now returns the existing row unchanged.
    if (!trackingInfo.scanEvents?.length) {
      return await trackingRepo.getEvents(shipment_id, client);
    }

    await trackingRepo.removeEvents(shipment_id, client);
    await trackingRepo.insertEvents(trackingInfo, shipment_id, client);

    // patch(), not update(): see cancelLabel's note above - this changes
    // three columns and preserves every other one verbatim, ids included.
    await shipmentRepo.patch(
      shipment_id,
      {
        shipping_status: trackingInfo.latestStatus ?? shipment.shipping_status,
        est_delivery:
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
}: {
  // OPTIONAL: the server resolves the carrier it ships with when the caller
  // does not name one, which is what took a production uuid out of the browser.
  carrier_id?: string | null;
  // Checked by the switch below rather than trusted: it arrives in req.body,
  // and the default case is what turns an unrecognised value into an error
  // instead of a quote from the wrong end of the country.
  shippingType: unknown;
  // Derived from the builder's own input rather than restated, so a change to
  // what a rate quote needs lands here without an edit.
  address: RatesInput["shipperAddress"];
  pkg?: RatesInput["pkg"];
  pickupType?: RatesInput["pickupType"];
  declaredValue?: RatesInput["declaredValue"];
}) {
  let shipperAddress: RatesInput["shipperAddress"];
  let recipientAddress: RatesInput["recipientAddress"];

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
  return shippingHandler.getRates(await carrierIdOr(carrier_id), null, {
    shipperAddress,
    recipientAddress,
    pkg,
    pickupType,
    declaredValue,
  });
}

// Same shape and reasoning as cancelLabel: cancelling a pickup is idempotent and runs outside any transaction - a rollback after it would leave a courier not coming and a row that says one is.
export async function cancelPickup({
  pickup_id,
  carrier_id,
}: {
  pickup_id: string;
  carrier_id?: string | null;
}): Promise<PickupRow | null> {
  // Same guard as cancelLabel and getTracking: an unknown id used to read three fields off null after deciding to call the carrier.
  const pickup = await pickupRepo.getById(pickup_id);
  if (!pickup) {
    const err: Error & { statusCode?: number } = new Error(
      `no pickup ${pickup_id} to cancel`
    );
    err.statusCode = 404;
    throw err;
  }

  // Converted at the boundary, not assumed: confirmation_number is text; requested_at is a Date (pg parses timestamp columns) even though the generated type says string.
  // The date is sent as YYYY-MM-DD, the form the FedEx pickup API takes.
  const requestedAt = pickup.requested_at as unknown as Date | string | null;
  const pickupDate =
    requestedAt instanceof Date
      ? requestedAt.toISOString().slice(0, 10)
      : (requestedAt ?? null);

  await shippingHandler.cancelPickup(await carrierIdOr(carrier_id), undefined, {
    confirmationCode:
      pickup.confirmation_number === null ? null : String(pickup.confirmation_number),
    pickupDate,
    location: pickup.location,
  });

  // Two bugs at once: the repo reads pickup_status, so `status` wrote the existing status back unchanged; and the CHECK constraint allows only pending/scheduled/completed/canceled (one L) - "cancelled" was refused outright.
  return await pickupRepo.update({
    id: pickup.id,
    confirmation_number: pickup.confirmation_number,
    pickup_status: "canceled",
  });
}
