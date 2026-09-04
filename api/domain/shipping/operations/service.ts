import withTransaction from "#shared/db/withTransaction.ts";
// The SERVICE, not a repo: shipments carries the order-link and read-modify-
// write helpers (getOrderLink, patch) alongside the bare CRUD.
import * as shipmentRepo from "#domain/shipping/shipments/service.ts";
import * as trackingRepo from "#domain/shipping/tracking/service.ts";
import * as shipmentView from "#domain/shipping/shipments/view.ts";
// The SERVICE, not a repo: a pickup hangs off a SHIPMENT.
import * as pickupRepo from "#domain/shipping/pickups/service.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as addressesRepo from "#db/places/addresses/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as carrierServices from "#domain/shipping/services/service.ts";
import * as shippingRules from "#domain/shipping/rules.ts";
import * as shippingHandler from "#domain/shipping/operations/handler.ts";
import { carrierIdOr } from "#domain/shipping/operations/resolver.ts";
import { FEDEX_STORE_ADDRESS, DORADO_ADDRESS } from "#providers/shipments/constants.ts";
import { attempt } from "#shared/attempt.ts";
import type { OrderViewShipment as ShipmentRow } from "@dorado/contracts";
import type { ParsedTracking } from "#providers/shipments/utils/parsing.ts";
// The carrier's own rate-quote input, derived from the handler rather than
// named there: a provider's request shape is not one of our columns, so it has
// no home in @dorado/contracts and no home under db/ or domain/ either.
type RatesInput = Parameters<typeof shippingHandler.getRates>[2];
import type { ShipmentPickup } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";
import type { CheckoutRate, Direction, Shipment, ShipmentView, ShippingCancelLabelBody, ShippingCancelPickupBody, ShippingCheckPickupBody, ShippingGetLocationsBody, ShippingValidateAddressBody } from "@dorado/contracts";


// EVERY OPERATION RESOLVES THE ADDRESS FROM ITS OWN ID (D214 item 11): the
// client sends address_id, never a composed address object, so a rate quote
// cannot be asked about somewhere the caller does not actually hold on file.
async function requireAddress(address_id: string) {
  const address = await addressesRepo.getOne(address_id);
  shippingRules.assertAddress(address, address_id);
  return address;
}

// fetchTracking is the seam a test uses instead of calling FedEx. It answers
// the provider's own ParsedTracking - four fields (scanEvents, latestStatus,
// estimatedDeliveryTime, deliveredAt) - and a narrower shape would compile and
// then fail at the body.
// Runs OUTSIDE any transaction: cancelling a label first, inside one, risked a later failure rolling back our record while FedEx had already killed the label - a customer holding a label the system still calls active.
// Safe because cancel is idempotent - a retry just cancels an already-cancelled label. Creating a label is NOT idempotent and doesn't get this treatment; see domain/orders/service.ts.
export async function cancelLabel(
  { shipment_id, carrier_id }: ShippingCancelLabelBody
): Promise<ShipmentRow | null> {
  // An unknown shipment id used to reach the carrier before this guard existed - getById returning null meant a TypeError AFTER deciding to call FedEx, not before.
  const shipment = await shipmentRepo.getById(shipment_id);
  shippingRules.assertShipment(shipment, shipment_id);

  await shippingHandler.cancelLabel(await carrierIdOr(carrier_id), undefined, {
    trackingNumber: shipment.tracking_number,
  });

  // A one-column update: everything else is left alone by the statement itself.
  return await withTransaction((tx) => shipmentRepo.update(shipment.id, { shipping_status: "Cancelled" }, tx));
}

// fetchTracking is a separate parameter, not a request field - the controller only ever passes shipment_id, so nothing in production could reach it. Tests inject a function instead of calling FedEx; FEDEX_ENV=sandbox is for a human smoke test, never a test dependency.
// Returns the shipment's tracking EVENTS, not the shipment - even on the early return, so "nothing recognised" looks the same as "nothing changed".
// Answers the whole ShipmentView, refreshed: the caller asked "where is my
// parcel", and the answer is the parcel - its progress timeline included -
// rather than a bag of scan rows it would have to reason over itself.
export async function getTracking(
  shipment_id: string,
  isAdmin: boolean,
  fetchTracking?: (shipment: ShipmentRow, client?: Executor) => Promise<ParsedTracking>
): Promise<ShipmentView | null> {
  return withTransaction(async (client) => {
    const shipment = await shipmentRepo.getById(shipment_id, client);
    // Same guard as cancelLabel: an unknown id used to read off null after opening a transaction, before reaching the carrier.
    shippingRules.assertShipment(shipment, shipment_id);

    // carrier_id comes through the shipment's service - a shipment with no service yet (a shell, before its label) has none.
    const service = shipment.carrier_service_id
      ? await servicesRepo.getOne(shipment.carrier_service_id, client)
      : undefined;

    // There is no carrier to ask, and asking `undefined` would have reached
    // the provider registry as "Unsupported carrier: ".
    const carrier_id = service?.carrier_id ?? null;
    let trackingInfo: ParsedTracking;
    if (fetchTracking) {
      trackingInfo = await fetchTracking(shipment, client);
    } else {
      shippingRules.assertCarrier(carrier_id, shipment_id);
      trackingInfo = await shippingHandler.getTracking(
        carrier_id, client, { tracking_number: shipment.tracking_number }
      );
    }

    // A refresh that recognizes nothing is not news - it used to be treated as news that everything is gone: removeEvents is an unconditional DELETE, so an unrecognized response (parseTracking's placeholder strings, which `??` never catches) deleted a shipment's whole tracking history and wrote back "Status Unknown" or a nulled estimate/delivered_at.
    // It already happened: production has four shipments at "Status Unknown" with zero events and three at "Delivered" with zero - only this function ever writes those two statuses, so they had events when marked and don't now.
    // Nothing here is authoritative - FedEx is, and a later good refresh replaces the lot. Keeping what's known beats replacing it with a placeholder, so an unrecognized response now returns the existing row unchanged.
    if (!trackingInfo.scanEvents?.length) {
      return await shipmentView.getById(shipment_id, isAdmin, client);
    }

    await trackingRepo.removeEvents(shipment_id, client);
    await trackingRepo.insertEvents(trackingInfo, shipment_id, client);

    // Three columns; every other one is left alone by the statement itself.
    await shipmentRepo.update(
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

    return await shipmentView.getById(shipment_id, isAdmin, client);
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
  shippingRules.assertShippingType(shippingType);
  // Inbound is the customer sending metal in; Outbound and Return both leave
  // from us, which is the only distinction this call needs.
  const inbound = shippingType === "Inbound";
  const shipperAddress: RatesInput["shipperAddress"] = inbound ? address : DORADO_ADDRESS;
  const recipientAddress: RatesInput["recipientAddress"] = inbound
    ? FEDEX_STORE_ADDRESS
    : address;

  return shippingHandler.getRates(await carrierIdOr(carrier_id), undefined, {
    shipperAddress,
    recipientAddress,
    pkg,
    pickupType,
    declaredValue,
  });
}

// GET /api/fulfillments/:id/rates - THE PARCEL'S OWN RATES (rulings 69/70).
//
// It was GET /checkout/rates?direction=, reading the address, the box and the
// chosen service off the checkout row. Those are the PARCEL's columns now
// (migration 128), so fulfillments owns the parcel facts and shipping does what
// it always did: ask the carrier and join the answer to the catalogue. The
// basket is still the checkout's - it is what the parcel weighs and what it is
// insured for - and it is reached through the checkout that points at this
// draft, never through a column of it.
//
// Nobody has picked a service yet, which is the whole point of the call, so
// this asks the carrier about every one it offers.
export async function getFulfillmentRates(fulfillment_id: string): Promise<CheckoutRate[]> {
  const view = await fulfillmentService.getById(fulfillment_id);
  shippingRules.assertRatableFulfillment(view, fulfillment_id);
  const parcel = view.parcel;
  shippingRules.assertRatableParcel(parcel, fulfillment_id);

  const checkout = await checkoutService.ownerOfFulfillment(fulfillment_id);
  shippingRules.assertRatableCheckout(checkout, fulfillment_id);
  const cart = await checkoutService.getItemsForOrder(checkout.id);
  shippingRules.assertRatableCart(cart.length);

  shippingRules.assertPackageChosen(parcel.package_id);
  const box = await packagesRepo.getOne(parcel.package_id);
  shippingRules.assertPackage(box, parcel.package_id);
  const weight = shippingRules.parcelWeightLb(cart, box);

  const inbound = parcel.direction === "Inbound";
  const address_id = inbound ? parcel.shipper_address_id : parcel.recipient_address_id;
  shippingRules.assertAddressChosen(address_id);
  const address = await requireAddress(address_id);

  // Service-agnostic clamp - the same lowest-ceiling answer
  // quotes/service.ts's purchaseOrderQuote applies before a service exists.
  const total = inbound ? await checkoutService.purchaseTotal(checkout.id) : 0;
  const declaredValue = await carrierServices.clampInsuredValue(
    shippingRules.declaredValue(total)
  );

  const quoted = await quoteRate({
    shippingType: inbound ? "Inbound" : "Outbound",
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

  // JOINED HERE, NOT IN THE BROWSER. The carrier answers by its own
  // serviceType; the row stores a shipping.services id. Pairing the two was a
  // client-side join in the stepper's ServiceSelector - it is the server's,
  // and it is what lets a selector render a list and send back one id.
  return shippingRules.offeredRates(
    quoted, await carrierServices.getOfferedServices(null), parcel.carrier_service_id
  );
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
  shippingRules.assertReadyDate(readyAt);
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
): Promise<ShipmentPickup | null> {
  // Same guard as cancelLabel and getTracking: an unknown id used to read three fields off null after deciding to call the carrier.
  const pickup = await pickupRepo.getById(pickup_id);
  shippingRules.assertPickup(pickup, pickup_id);

  // Widened rather than assumed: ShipmentPickup.requested_at is declared
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

  // The CHECK constraint allows only pending/scheduled/completed/canceled (one
  // L) - "cancelled" is refused outright.
  // Opened here rather than taken as an argument (ruling 56): this write must
  // stand alone, AFTER the FedEx call above - see this function's own header.
  return await withTransaction((tx) =>
    pickupRepo.update(pickup.id, {
      requested_at: requestedAt,
      status: "canceled",
      confirmation_number: pickup.confirmation_number,
      location: pickup.location,
    }, tx)
  );
}

// Compensation for a label/pickup a failed transaction orphaned. Best-effort - never masks the original error.
export async function voidLabel(
  trackingNumber: string | undefined | null
): Promise<void> {
  if (!trackingNumber) return;
  await attempt(`ORPHANED SHIPPING LABEL ${trackingNumber}`, async () =>
    shippingHandler.cancelLabel(await carrierIdOr(null), undefined, { trackingNumber })
  );
}

// Takes the booking as the carrier reported it - a confirmation code, the date
// it was requested for and where the courier was sent - because the row that
// would have recorded it is exactly what the rollback removed.
export async function voidPickup(
  pickup: {
    confirmationNumber?: string | null;
    pickupDate?: string | null;
    location?: string | null;
  } | null | undefined
): Promise<void> {
  if (!pickup?.confirmationNumber) return;
  await attempt(`ORPHANED CARRIER PICKUP ${pickup.confirmationNumber}`, async () =>
    shippingHandler.cancelPickup(await carrierIdOr(null), undefined, {
      confirmationCode: pickup.confirmationNumber,
      pickupDate: pickup.pickupDate ?? undefined,
      location: pickup.location ?? undefined,
    })
  );
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
export async function labelBufferOrVoid(
  labelData: { labelFile: string | null; tracking_number: string | null },
  cancel: typeof voidLabel = voidLabel
): Promise<Buffer> {
  if (!labelData.labelFile) await cancel(labelData.tracking_number);
  shippingRules.assertLabelFile(labelData.labelFile);
  return Buffer.from(labelData.labelFile, "base64");
}
