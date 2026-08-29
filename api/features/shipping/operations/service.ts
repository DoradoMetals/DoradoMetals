import withTransaction from "#shared/db/withTransaction.js";
// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as shipmentRepo from "#features/shipping/shipments/service.ts";
import * as trackingRepo from "#features/shipping/tracking/service.ts";
// The SERVICE, not a repo: a pickup hangs off a SHIPMENT now, and the order,
// the user and the carrier it reports are reconstructed through one.
import * as pickupRepo from "#features/shipping/pickups/service.ts";
import * as shippingHandler from "#features/shipping/operations/handler.ts";
import { carrierIdOr } from "#features/shipping/operations/resolver.ts";
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from "#providers/shipments/constants.ts";
import type { ComposedShipment as ShipmentRow } from "#features/shipping/shipments/compose.ts";
import type { TrackedShipment as TrackingRow } from "#features/shipping/tracking/service.ts";
import type { ParsedTracking } from "#providers/shipments/utils/parsing.ts";
import type { RatesInput } from "#features/shipping/operations/handler.ts";
import type { ComposedPickup as PickupRow } from "#features/shipping/pickups/compose.ts";
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
import type { shipping } from "@dorado/contracts";

export type FetchTracking = (
  shipment: ShipmentRow,
  client?: Executor
) => Promise<ParsedTracking>;

// THE THREE DIRECTIONS A PARCEL MOVES, READ FROM THE COLUMN THAT HOLDS THEM
// (D103). This was `"Inbound" | "Outbound" | "Return"` written out here - an
// exact duplicate of the `shipping.direction` enum, which is what
// shipping.shipments.direction is declared as and what every one of these
// values is eventually stored in. Not to be confused with orders.direction
// (purchase / sale); the two are different enums and both are called
// "direction", which is precisely why neither should be spelled by hand.
type ShippingType = shipping.ShipmentsRow["direction"];

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
// features/orders/service.ts.
export async function cancelLabel({
  shipment_id,
  carrier_id,
}: {
  shipment_id: string;
  carrier_id?: string | null;
}): Promise<ShipmentRow | null> {
  // A SHIPMENT ID THAT NAMES NOTHING USED TO REACH THE CARRIER.
  //
  // This read `shipment.tracking_number` off whatever getById returned, and
  // getById returns null for an unknown id - so cancelling a label for a
  // shipment that does not exist threw a TypeError AFTER deciding to call
  // FedEx, with the id having come from a request. Invisible until the
  // shipments repo was typed, because repo.js resolved through a dynamic index
  // and every field on it was `any`.
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

  return await shipmentRepo.update({
    ...shipment,
    id: shipment.id,
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
    // Same guard as cancelLabel: an unknown id read `shipment.carrier_id` off
    // null, AFTER opening a transaction and before reaching the carrier.
    if (!shipment) {
      const err: Error & { statusCode?: number } = new Error(
        `no shipment ${shipment_id} to track`
      );
      err.statusCode = 404;
      throw err;
    }

    const trackingInfo = fetchTracking
      ? await fetchTracking(shipment, client)
      : await shippingHandler.getTracking(
          // carrier_id comes through the shipment's SERVICE now, so a shipment
          // with no service yet has none - a shell created before the label was
          // bought. There is no carrier to ask, and asking `undefined` would
          // have reached the provider registry as "Unsupported carrier: ".
          requireCarrier(shipment.carrier_id, shipment_id),
          client,
          { tracking_number: shipment.tracking_number }
        );

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

// Same shape as cancelLabel, and the same reasoning: cancelling a pickup is
// idempotent, so it happens outside any transaction and a retry is harmless.
// Rolling back after it would have left a courier who is not coming and a row
// that says one is.
export async function cancelPickup({
  pickup_id,
  carrier_id,
}: {
  pickup_id: string;
  carrier_id?: string | null;
}): Promise<PickupRow | null> {
  // Same guard as cancelLabel and getTracking: an unknown id read three fields
  // off null, AFTER deciding to call the carrier. Invisible while the pickups
  // repo resolved through a dynamic index and every field on it was `any`.
  const pickup = await pickupRepo.getById(pickup_id);
  if (!pickup) {
    const err: Error & { statusCode?: number } = new Error(
      `no pickup ${pickup_id} to cancel`
    );
    err.statusCode = 404;
    throw err;
  }

  // CONVERTED AT THE BOUNDARY, NOT ASSUMED. The carrier wants strings;
  // confirmation_number is NUMERIC on the wire because exchange's column is,
  // and pickup_requested_at arrives as a Date because pg parses the column.
  // Both were passed through unconverted while the pickups repo resolved
  // through a dynamic index and every field on it was `any` - so what actually
  // reached FedEx was a number and a Date object, and whether that worked
  // depended on the provider's own coercion.
  //
  // The date is sent as YYYY-MM-DD, which is the form the FedEx pickup API
  // takes and what a caller passing `date` would already have supplied.
  const pickupDate =
    pickup.pickup_requested_at instanceof Date
      ? pickup.pickup_requested_at.toISOString().slice(0, 10)
      : (pickup.pickup_requested_at ?? null);

  await shippingHandler.cancelPickup(await carrierIdOr(carrier_id), undefined, {
    confirmationCode:
      pickup.confirmation_number === null ? null : String(pickup.confirmation_number),
    pickupDate,
    location: pickup.location,
  });

  // Two things were wrong here. The repo reads pickup_status, so `status`
  // wrote the row's existing status straight back; and exchange.carrier_pickups
  // has a CHECK constraint allowing only pending / scheduled / completed /
  // canceled - one l - so "cancelled" is refused outright.
  return await pickupRepo.update({
    ...pickup,
    id: pickup.id,
    confirmation_number: pickup.confirmation_number,
    pickup_status: "canceled",
  });
}
