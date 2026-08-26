import withTransaction from "#shared/db/withTransaction.js";
import * as shipmentRepo from "#features/shipping/shipments/repo.js";
import * as trackingRepo from "#features/shipping/tracking/repo.js";
import * as pickupRepo from "#features/shipping/pickups/repo.js";
import * as shippingHandler from "#features/shipping/operations/handler.ts";
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from "#providers/fedex/constants.ts";
import type { ShipmentRow } from "#features/shipping/shipments/repo.next.ts";
import type { TrackingRow } from "#features/shipping/tracking/repo.next.ts";
import type { ParsedTracking } from "#providers/fedex/utils/parsing.ts";
import type { RatesInput } from "#features/shipping/operations/handler.ts";
import type { PickupRow } from "#features/shipping/pickups/repo.next.ts";
import type { PoolClient } from "pg";

// The three repos here go through their own repo.js switches, which are
// JavaScript indexing SOURCES dynamically - so TypeScript hands back `any` and
// the row types have to be named. Taken from repo.next, which `diff` proves
// agrees with repo.exchange row for row.
type Executor = PoolClient | undefined;

// `fetchTracking` is the seam a test uses instead of calling FedEx.
//
// IT RETURNS ParsedTracking, NOT TrackingInfo, AND THE DIFFERENCE MATTERS.
// TrackingInfo - in tracking/repo.next.ts - declares only `scanEvents`, because
// that is all insertEvents reads. This function reads four fields: scanEvents,
// latestStatus, estimatedDeliveryTime and deliveredAt. Typing the seam as the
// narrower one compiled until the body was checked, and then said those three
// do not exist - which is true of TrackingInfo and false of what actually
// arrives. ParsedTracking is the parser's own exported return, and it is
// assignable to TrackingInfo where insertEvents wants it.
export type FetchTracking = (
  shipment: ShipmentRow,
  client?: Executor
) => Promise<ParsedTracking>;

export type ShippingType = "Inbound" | "Outbound" | "Return";

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
export async function cancelLabel({
  shipment_id,
  carrier_id,
}: {
  shipment_id: string;
  carrier_id: string;
}): Promise<ShipmentRow | null> {
  const shipment = await shipmentRepo.getById(shipment_id);

  await shippingHandler.cancelLabel(carrier_id, undefined, {
    trackingNumber: shipment.tracking_number,
  });

  return await shipmentRepo.update({
    ...shipment,
    shipping_status: "Cancelled",
  });
}

// `fetchTracking` is a separate parameter, not a field on an input object, for
// the reason sendEmail's transport is: the controller destructures shipment_id
// out of req.body and passes that alone, so a field would be reachable from the
// request. Nothing in production passes one. A test passes a function returning
// the parsed shape, which is what lets the guard below be checked without
// calling FedEx - and FEDEX_ENV=sandbox is for a human smoke test, never a test
// dependency.
// Returns the shipment's tracking EVENTS, not the shipment - including on the
// early return below, which is what makes "nothing recognised" indistinguishable
// from "nothing changed" to a caller, deliberately.
export async function getTracking(
  shipment_id: string,
  fetchTracking?: FetchTracking
): Promise<TrackingRow | null> {
  return withTransaction(async (client) => {
    const shipment = await shipmentRepo.getById(shipment_id, client);

    const trackingInfo = fetchTracking
      ? await fetchTracking(shipment, client)
      : await shippingHandler.getTracking(shipment.carrier_id, client, {
          tracking_number: shipment.tracking_number,
        });

    // A REFRESH THAT RECOGNISED NOTHING IS NOT NEWS, AND USED TO BE TREATED AS
    // NEWS THAT EVERYTHING IS GONE.
    //
    // removeEvents is an unconditional DELETE and insertEvents returns 0
    // without inserting when there is nothing to insert, so a response whose
    // scan events are all of types FEDEX_TRACKING_STATUS_MAP does not name -
    // or which carries none at all - deleted the shipment's whole tracking
    // history and put nothing back. The update below then overwrote the status
    // with parseTracking's own "Status Unknown" placeholder (a string, so the
    // `??` never caught it), nulled the estimate via its "TBD" placeholder, and
    // nulled delivered_at.
    //
    // IT HAS ALREADY HAPPENED. Production has four shipments sitting at
    // "Status Unknown" with zero tracking events, and three at "Delivered" with
    // zero. "Delivered" and "Status Unknown" can only ever come from this
    // function - everything else writes "Label Created" or "Cancelled" - so
    // those three had scan events at the moment they were marked delivered and
    // have none now.
    //
    // Nothing here is authoritative: FedEx is, and a later refresh that does
    // recognise something replaces the lot. Keeping what is known beats
    // replacing it with a placeholder.
    if (!trackingInfo.scanEvents?.length) {
      return await trackingRepo.getEvents(shipment_id, client);
    }

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
}: {
  carrier_id: string;
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
export async function cancelPickup({
  pickup_id,
  carrier_id,
}: {
  pickup_id: string;
  carrier_id: string;
}): Promise<PickupRow | null> {
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
