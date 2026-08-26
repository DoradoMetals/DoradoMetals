import * as endpoints from "#providers/fedex/endpoints.ts";
import * as payloads from "#providers/fedex/payloads.ts";
import {
  parseAddressValidation,
  parseLocations,
  parsePickupAvailability,
  parseRates,
  parseScheduledPickup,
  parseTracking,
  parseCreateShipment,
} from "#providers/fedex/utils/parsing.ts";

export async function validateAddress(address: Record<string, unknown> | null | undefined) {
  if (!address) {
    const err: Error & { statusCode?: number } = new Error("an address is required to validate one");
    err.statusCode = 400;
    throw err;
  }
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.validateAddressPayload(address);

  const data = await endpoints.fedexPost({
    token,
    path: "/address/v1/addresses/resolve",
    payload,
  });

  return parseAddressValidation(data);
}

export async function getRates(input: any) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.rateQuotePayload(input);

  const data = await endpoints.fedexPost({
    token,
    path: "/rate/v1/comprehensiverates/quotes",
    payload,
  });

  return parseRates(data);
}

export async function createLabel(input: any) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.createShipmentPayload(input);

  const data = await endpoints.fedexPost({
    token,
    path: "/ship/v1/shipments",
    payload,
  });

  return parseCreateShipment(data);
}

export async function cancelLabel({
  tracking_number,
}: {
  // Nullable because the callers' rows are: a shipment may have no tracking
  // number yet. Asking FedEx to cancel "undefined" is not a cancellation, and
  // the compensating undoLabel already returns early on a falsy one - this
  // refuses loudly for anyone who does not.
  tracking_number: string | null | undefined;
}) {
  if (!tracking_number) {
    const err: Error & { statusCode?: number } = new Error(
      "a tracking number is required to cancel a label"
    );
    err.statusCode = 400;
    throw err;
  }
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.cancelShipmentPayload(tracking_number);

  await endpoints.fedexPut({
    token,
    path: "/ship/v1/shipments/cancel",
    payload,
  });

  return { cancelled: true };
}

export async function checkPickup({
  pickupAddress,
  code,
  readyDate,
}: {
  // Nullable for the same reason as the rest: the caller builds this from rows
  // that may not carry an address yet.
  pickupAddress: Record<string, unknown> | null | undefined;
  code?: string;
  // A Date, not a string: formatFedexTime reads getHours() and
  // parsePickupAvailability reads getTime(). The controller converts.
  readyDate: Date;
}) {
  if (!pickupAddress) {
    const err: Error & { statusCode?: number } = new Error(
      "a pickup address is required to check availability"
    );
    err.statusCode = 400;
    throw err;
  }

  const token = await endpoints.fetchAccessToken();
  const payload = payloads.pickupAvailabilityPayload({
    pickupAddress,
    code,
    readyDate,
  });

  const data = await endpoints.fedexPost({
    token,
    path: "/pickup/v1/pickups/availabilities",
    payload,
  });

  return parsePickupAvailability(data, readyDate);
}

export async function createPickup(input: any) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.schedulePickupPayload(input);

  const data = await endpoints.fedexPost({
    token,
    path: "/pickup/v1/pickups",
    payload,
  });

  return parseScheduledPickup(data);
}

export async function cancelPickup({
  confirmationCode,
  pickupDate,
  location,
}: {
  // A pickup that was never confirmed has no code, and cancelling "undefined"
  // is not a cancellation - FedEx would answer about a pickup nobody named.
  confirmationCode: string | number | null | undefined;
  pickupDate?: unknown;
  location?: unknown;
}) {
  if (!confirmationCode) {
    const err: Error & { statusCode?: number } = new Error(
      "a confirmation code is required to cancel a pickup"
    );
    err.statusCode = 400;
    throw err;
  }
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.cancelPickupPayload({
    confirmationCode,
    pickupDate,
    location,
  });

  await endpoints.fedexPut({
    token,
    path: "/pickup/v1/pickups/cancel",
    payload,
  });

  return { cancelled: true };
}

export async function getLocations({
  address,
  radiusMiles = 25,
  maxResults = 10,
}: {
  // Same as the rest: built from rows that may not carry one.
  address: Record<string, unknown> | null | undefined;
  radiusMiles?: number;
  maxResults?: number;
}) {
  if (!address) {
    const err: Error & { statusCode?: number } = new Error(
      "an address is required to find locations near one"
    );
    err.statusCode = 400;
    throw err;
  }
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.locationsPayload({
    address,
    radiusMiles,
    maxResults,
  });

  const data = await endpoints.fedexPost({
    token,
    path: "/location/v1/locations",
    payload,
  });

  return parseLocations(data);
}

export async function getTracking(input: any) {
  const token = await endpoints.fetchTrackingToken();
  const payload = payloads.trackingPayload(input.tracking_number);

  const data = await endpoints.fedexPost({
    token,
    path: "/track/v1/trackingnumbers",
    payload,
  });

  return parseTracking(data);
}
