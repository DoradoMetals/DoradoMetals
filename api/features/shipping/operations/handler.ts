// One call per shipping operation: resolve the carrier, build its request,
// send it.
//
// Every function is the same three lines, and the repetition is the point -
// each one names an operation the application performs, so a carrier that
// cannot do one of them fails at the call rather than by omission. See
// createPickup for what the alternative cost.
//
// THE INPUT TYPES ARE DERIVED FROM THE BUILDERS, NOT WRITTEN HERE. Each
// operation takes exactly what its builder takes, so `InputFor<"getRates">` is
// whatever getRatesInput accepts and changes when that does. Nothing to keep in
// step by hand.
//
// `unknown` was the first attempt and the checker refused it, correctly: this
// layer passes the value straight to a builder that does inspect it, so a type
// saying "we know nothing" is not usable at the call it makes. Writing one
// interface by hand was the other option, and it would describe FedEx's shape
// while claiming to be the general case - which registry.ts already declines to
// do for the same reason.
//
// When a second carrier arrives, `Builders` becomes a union and this stops
// compiling. That is the intended outcome: two carriers wanting different
// shapes is a design conversation, not something to paper over with `any`.
//
// `client` is an optional executor threaded through to the carriers repo, the
// same convention every repo call here follows.
import { resolveCarrier } from "#features/shipping/operations/resolver.ts";
import { BUILDERS } from "#features/shipping/operations/builders.ts";

type Builders = (typeof BUILDERS)[keyof typeof BUILDERS];
type InputFor<K extends keyof Builders> = Parameters<Builders[K]>[0];

// EXPORTED for callers that assemble one of these inputs rather than receiving
// it whole - features/shipping/operations/service.ts builds the two addresses
// for a rate quote out of one address plus a direction. Derived here for the
// same reason the parameters are: restating the builder's shape by hand is a
// second copy that stops agreeing the moment the builder changes.
export type RatesInput = NonNullable<InputFor<"getRates">>;

export async function validateAddress(
  carrier_id: string,
  client: unknown,
  { address }: InputFor<"validateAddress">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.validateAddress(builders.validateAddress({ address }));
}

export async function getRates(
  carrier_id: string,
  client: unknown,
  input: InputFor<"getRates">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getRates(builders.getRates(input));
}

export async function createLabel(
  carrier_id: string,
  client: unknown,
  input: InputFor<"createLabel">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.createLabel(builders.createLabel(input));
}

export async function cancelLabel(
  carrier_id: string,
  client: unknown,
  input: InputFor<"cancelLabel">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.cancelLabel(builders.cancelLabel(input));
}

export async function checkPickup(
  carrier_id: string,
  client: unknown,
  input: InputFor<"checkPickup">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.checkPickup(builders.checkPickup(input));
}

export async function createPickup(
  carrier_id: string,
  client: unknown,
  input: InputFor<"createPickup">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  // provider.createPickup, not schedulePickup - fedex.js has never exported a
  // function by that name, so this threw "provider.schedulePickup is not a
  // function" before any FedEx request was built or sent. Every other method
  // here matches its export exactly; this one did not.
  return await provider.createPickup(builders.createPickup(input));
}

export async function cancelPickup(
  carrier_id: string,
  client: unknown,
  input: InputFor<"cancelPickup">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.cancelPickup(builders.cancelPickup(input));
}

export async function getLocations(
  carrier_id: string,
  client: unknown,
  input: InputFor<"getLocations">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getLocations(builders.getLocations(input));
}

export async function getTracking(
  carrier_id: string,
  client: unknown,
  input: InputFor<"getTracking">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getTracking(builders.getTracking(input));
}
