import { resolveCarrier } from "#features/shipping/operations/resolver.ts";

export async function validateAddress(carrier_id, client, { address }) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.validateAddress(builders.validateAddress({ address }));
}

export async function getRates(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getRates(builders.getRates(input));
}

export async function createLabel(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.createLabel(builders.createLabel(input));
}

export async function cancelLabel(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.cancelLabel(builders.cancelLabel(input));
}

export async function checkPickup(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.checkPickup(builders.checkPickup(input));
}

export async function createPickup(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  // provider.createPickup, not schedulePickup - fedex.js has never exported a
  // function by that name, so this threw "provider.schedulePickup is not a
  // function" before any FedEx request was built or sent. Every other method
  // here matches its export exactly; this one did not.
  return await provider.createPickup(builders.createPickup(input));
}

export async function cancelPickup(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.cancelPickup(builders.cancelPickup(input));
}

export async function getLocations(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getLocations(builders.getLocations(input));
}

export async function getTracking(carrier_id, client, input) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getTracking(builders.getTracking(input));
}
