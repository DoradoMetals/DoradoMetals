import * as endpoints from "#providers/fedex/endpoints.js";
import * as payloads from "#providers/fedex/payloads.js";
import {
  parseAddressValidation,
  parseLocations,
  parsePickupAvailability,
  parseRates,
  parseScheduledPickup,
  parseTracking,
  parseCreateShipment,
} from "#providers/fedex/utils/parsing.js";

export async function validateAddress(address) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.validateAddressPayload(address);

  const data = await endpoints.fedexPost({
    token,
    path: "/address/v1/addresses/resolve",
    payload,
  });

  return parseAddressValidation(data);
}

export async function getRates(input) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.rateQuotePayload(input);

  const data = await endpoints.fedexPost({
    token,
    path: "/rate/v1/comprehensiverates/quotes",
    payload,
  });

  return parseRates(data);
}

export async function createLabel(input) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.createShipmentPayload(input);

  const data = await endpoints.fedexPost({
    token,
    path: "/ship/v1/shipments",
    payload,
  });

  return parseCreateShipment(data);
}

export async function cancelLabel({ tracking_number }) {
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
}) {
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

export async function createPickup(input) {
  const token = await endpoints.fetchAccessToken();
  const payload = payloads.schedulePickupPayload(input);

  const data = await endpoints.fedexPost({
    token,
    path: "/pickup/v1/pickups",
    payload,
  });

  return parseScheduledPickup(data);
}

export async function cancelPickup({ confirmationCode, pickupDate, location }) {
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
}) {
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

export async function getTracking(tracking_number) {
  const token = await endpoints.fetchTrackingToken();
  const payload = payloads.trackingPayload(tracking_number);

  const data = await endpoints.fedexPost({
    token,
    path: "/track/v1/trackingnumbers",
    payload,
  });

  return parseTracking(data);
}
