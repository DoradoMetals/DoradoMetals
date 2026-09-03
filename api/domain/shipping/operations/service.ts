import withTransaction from "#shared/db/withTransaction.ts";
// The SERVICE, not a repo: shipments carries the order-link and read-modify-
// write helpers (getOrderLink, patch) alongside the bare CRUD.
import * as shipmentRepo from "#domain/shipping/shipments/service.ts";
import * as trackingRepo from "#domain/shipping/tracking/service.ts";
// The SERVICE, not a repo: a pickup hangs off a SHIPMENT.
import * as pickupRepo from "#domain/shipping/pickups/service.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as addressesRepo from "#db/places/addresses/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as shippingRules from "#domain/shipping/rules.ts";
import * as shippingHandler from "#domain/shipping/operations/handler.ts";
import { carrierIdOr } from "#domain/shipping/operations/resolver.ts";
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from "#providers/shipments/constants.ts";
import { reportError } from "#shared/observability/report.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";
import type { ShipmentBaseRow as ShipmentRow } from "#db/shipping/shipments/repo.ts";
import type { TrackedShipment as TrackingRow } from "#domain/shipping/tracking/service.ts";
import type { ParsedTracking } from "#providers/shipments/utils/parsing.ts";
import type { RatesInput } from "#domain/shipping/operations/handler.ts";
import type { PickupBaseRow as PickupRow } from "#db/shipping/pickups/repo.ts";
import type { PoolClient } from "pg";
import type {
  Direction,
  ShippingCancelLabelBody, ShippingCancelPickupBody, ShippingCheckPickupBody,
  ShippingGetLocationsBody, ShippingValidateAddressBody,
} from "@dorado/contracts";

type Executor = PoolClient | undefined;

// EVERY OPERATION RESOLVES THE ADDRESS FROM ITS OWN ID (D214 item 11): the
// client sends address_id, never a composed address object, so a rate quote
// cannot be asked about somewhere the caller does not actually hold on file.
async function requireAddress(address_id: string) {
  const address = await addressesRepo.getOne(address_id);
  if (!address) throw new NotFound(`no address ${address_id}`);
  return address;
}

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
export async function cancelLabel(
  { shipment_id, carrier_id }: ShippingCancelLabelBody
): Promise<ShipmentRow | null> {
  // An unknown shipment id used to reach the carrier before this guard existed - getById returning null meant a TypeError AFTER deciding to call FedEx, not before.
  const shipment = await shipmentRepo.getById(shipment_id);
  if (!shipment) {
    throw new NotFound(`no shipment ${shipment_id} to cancel`);
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
    throw new Conflict(
      `shipment ${shipment_id} has no carrier - it has no service, so no label ` +
        `has been bought for it yet`
    );
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
      throw new NotFound(`no shipment ${shipment_id} to track`);
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

// THE LOW-LEVEL QUOTE, from a resolved address and parcel - what a caller
// that already holds both (domain/orders/place.ts, mid-checkout) calls
// directly rather than round-tripping through an id it just read. getRates
// below is the id-resolving wrapper transport calls.
export async function quoteRate({
  carrier_id,
  shippingType,
  address,
  pkg,
  pickupType,
  declaredValue,
}: {
  carrier_id?: string | null;
  // Checked by the switch below rather than trusted: the default case is
  // what turns an unrecognised value into an error instead of a quote from
  // the wrong end of the country.
  shippingType: unknown;
  address: RatesInput["shipperAddress"];
  pkg?: RatesInput["pkg"];
  pickupType?: RatesInput["pickupType"];
  declaredValue?: RatesInput["declaredValue"];
}): Promise<ReturnType<typeof shippingHandler.getRates>> {
  let shipperAddress: RatesInput["shipperAddress"];
  let recipientAddress: RatesInput["recipientAddress"];

  switch (shippingType) {
    case "Inbound":
      shipperAddress = address;
      recipientAddress = FEDEX_STORE_ADDRESS;
      break;
    case "Outbound":
    case "Return":
      shipperAddress = DORADO_ADDRESS;
      recipientAddress = address;
      break;
    default:
      throw new Invalid(`invalid shippingType: ${shippingType}`);
  }
  return shippingHandler.getRates(await carrierIdOr(carrier_id), undefined, {
    shipperAddress,
    recipientAddress,
    pkg,
    pickupType,
    declaredValue,
  });
}

// GET /checkout/rates?direction= replaced the old body-fed rate endpoint
// (Jacob, 2026-09-03: "all the stuff that feeds into it can live directly on
// the server"). The client sends only its direction; everything else -
// address, package, weight, declared value - is read off the caller's own
// checkout row and items. Nobody has picked a service yet, which is the whole
// point of the call, so this asks the carrier about every one it offers.
export async function getCheckoutRates(
  user_id: string, direction: Direction
): Promise<ReturnType<typeof shippingHandler.getRates>> {
  const checkout = await checkoutService.getRowFor(user_id, direction);
  const cart = await checkoutService.getItemsForOrder(checkout.id);
  if (!cart.length) throw new Invalid("the checkout has no items to rate");

  if (!checkout.package_id) throw new Invalid("choose a package before requesting rates");
  const box = await packagesRepo.getOne(checkout.package_id);
  if (!box) throw new Invalid(`no package ${checkout.package_id}`);
  const weight = shippingRules.parcelWeightLb(cart, box);

  const shippingType = direction === "purchase" ? "Inbound" : "Outbound";
  const address_id =
    direction === "purchase" ? checkout.shipper_address_id : checkout.recipient_address_id;
  if (!address_id) throw new Invalid("choose an address before requesting rates");
  const address = await requireAddress(address_id);

  // Service-agnostic clamp - the same lowest-ceiling answer
  // quotes/service.ts's purchaseOrderQuote applies before a service exists.
  const total = direction === "purchase" ? await checkoutService.purchaseTotal(checkout.id) : 0;
  const declaredValue = await carrierServices.clampInsuredValue(
    shippingRules.declaredValue(total)
  );

  return quoteRate({
    shippingType,
    address,
    pkg: {
      weight: { units: "LB", value: weight },
      dimensions: {
        length: Number(box.length), width: Number(box.width),
        height: Number(box.height), units: "IN",
      },
    },
    declaredValue: declaredValue > 0 ? { amount: declaredValue, currency: "USD" } : undefined,
  });
}

// An address as the customer entered it, checked against the carrier before
// the checkout that owns it commits to it.
export async function validateAddress(
  body: ShippingValidateAddressBody
): Promise<ReturnType<typeof shippingHandler.validateAddress>> {
  const address = await requireAddress(body.address_id);
  return shippingHandler.validateAddress(await carrierIdOr(body.carrier_id), undefined, { address });
}

// The pickup windows a carrier will collect from address_id on readyDate.
export async function checkPickup(
  body: ShippingCheckPickupBody
): Promise<ReturnType<typeof shippingHandler.checkPickup>> {
  const address = await requireAddress(body.address_id);
  // readyDate is a Date everywhere below - JSON cannot carry one, so it is
  // converted at this boundary, where a request becomes objects.
  const readyAt = new Date(body.readyDate);
  if (Number.isNaN(readyAt.getTime())) {
    throw new Invalid("readyDate is required and must be a date");
  }
  return shippingHandler.checkPickup(await carrierIdOr(body.carrier_id), undefined, {
    pickupAddress: address, code: body.code, readyDate: readyAt,
  });
}

// The carrier's own drop-off points near address_id.
export async function getLocations(
  body: ShippingGetLocationsBody
): Promise<ReturnType<typeof shippingHandler.getLocations>> {
  const address = await requireAddress(body.address_id);
  return shippingHandler.getLocations(await carrierIdOr(body.carrier_id), undefined, {
    address, radiusMiles: body.radius_miles, maxResults: body.max_results,
  });
}

// Same shape and reasoning as cancelLabel: cancelling a pickup is idempotent and runs outside any transaction - a rollback after it would leave a courier not coming and a row that says one is.
export async function cancelPickup(
  { pickup_id, carrier_id }: ShippingCancelPickupBody
): Promise<PickupRow | null> {
  // Same guard as cancelLabel and getTracking: an unknown id used to read three fields off null after deciding to call the carrier.
  const pickup = await pickupRepo.getById(pickup_id);
  if (!pickup) {
    throw new NotFound(`no pickup ${pickup_id} to cancel`);
  }

  // Widened rather than assumed: PickupBaseRow.requested_at is declared
  // `string` (the wire's shape, also what orders' OrderView needs it to stay
  // - widening the repo type ripples into that composed read), but pg parses
  // a timestamp column into a Date at runtime. The date is sent as
  // YYYY-MM-DD, the form the FedEx pickup API takes.
  const requestedAt = pickup.requested_at as Date | string | null;
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
  // Opened here rather than taken as an argument (ruling 56): this write must
  // stand alone, AFTER the FedEx call above - see this function's own header.
  return await withTransaction((tx) =>
    pickupRepo.update({
      id: pickup.id,
      confirmation_number: pickup.confirmation_number,
      pickup_status: "canceled",
    }, tx)
  );
}

// ===========================================================================
// COMPENSATION for an outside-world action a failed transaction has orphaned.
// ===========================================================================
//
// Creating a label is not idempotent and cannot be undone by a rollback, so the
// placement saga buys it first and voids it if the database work fails. These
// two are that compensating action, and they live HERE rather than in orders
// because they are carrier operations: orders knows no carrier id (carrierIdOr
// resolves it) and no confirmation-code vocabulary.
//
// NEITHER EVER MASKS THE ORIGINAL ERROR. If the compensation itself fails there
// is genuinely an orphaned label or an uncancelled courier, and that is worth a
// loud line in the log rather than a second exception nobody can act on: the
// first error is the one that explains what went wrong.
export async function voidLabel(
  trackingNumber: string | undefined | null
): Promise<void> {
  if (!trackingNumber) return;
  try {
    await shippingHandler.cancelLabel(await carrierIdOr(null), undefined, { trackingNumber });
  } catch (err) {
    reportError({
      at: "shipping.voidLabel",
      message:
        `ORPHANED SHIPPING LABEL ${trackingNumber}: the order it belonged to was ` +
        `rolled back and cancelling the label failed too`,
      err,
      extra: { trackingNumber },
    });
  }
}

// Takes the booking as the carrier reported it - a confirmation code, the date
// it was requested for and where the courier was sent - because the row that
// would have recorded it is exactly what the rollback removed.
export type OrphanedPickup = {
  confirmationNumber?: string | null;
  pickupDate?: string | null;
  location?: string | null;
};

export async function voidPickup(pickup: OrphanedPickup | null | undefined): Promise<void> {
  if (!pickup?.confirmationNumber) return;
  try {
    await shippingHandler.cancelPickup(await carrierIdOr(null), undefined, {
      confirmationCode: pickup.confirmationNumber,
      pickupDate: pickup.pickupDate ?? undefined,
      location: pickup.location ?? undefined,
    });
  } catch (err) {
    reportError({
      at: "shipping.voidPickup",
      message:
        `ORPHANED CARRIER PICKUP ${pickup.confirmationNumber}: the order it ` +
        `belonged to was rolled back and cancelling the pickup failed too`,
      err,
      extra: { confirmationNumber: pickup.confirmationNumber },
    });
  }
}

// A LABEL WITH NO FILE IS STILL A LABEL FEDEX HAS BILLED FOR.
//
// parseCreateShipment reads the label document off a deeply optional path while
// the tracking number comes from a different field, so a response can carry a
// real, billable tracking number and no label file - and `Buffer.from(null,
// "base64")` throws a TypeError. Both call sites built that buffer AFTER the
// label existed but BEFORE the try that compensates, so the TypeError escaped
// with the label left behind and no ORPHANED line either.
//
// `cancel` is a SEPARATE parameter rather than a field on labelData: labelData
// comes from the carrier's response, and a field would be reachable from
// something the carrier said.
export type CancelLabel = (trackingNumber: string | undefined | null) => Promise<void>;

export async function labelBufferOrVoid(
  labelData: { labelFile: string | null; tracking_number: string | null },
  cancel: CancelLabel = voidLabel
): Promise<Buffer> {
  if (!labelData.labelFile) {
    await cancel(labelData.tracking_number);
    throw new Error(
      "the carrier created a shipment but returned no label file - the label has been cancelled"
    );
  }
  return Buffer.from(labelData.labelFile, "base64");
}
