// One call per shipping operation: resolve the carrier, build its request, send it. The repetition is the point - each function names an operation, so a carrier that can't do one fails at the call, not by omission (see createPickup).
// Input types are derived from the BUILDERS, not written here - InputFor<K> is whatever the builder accepts, so nothing has to be kept in step by hand.
// Not `unknown` (this layer inspects the value) and not one hand-written interface (it would describe FedEx's shape while claiming to be general). A second carrier turns `Builders` into a union and this stops compiling - deliberately, since two carriers wanting different shapes is a design conversation.
// `client` is the optional executor threaded through, like every repo call.
import { resolveCarrier } from "#domain/shipping/operations/resolver.ts";
import { BUILDERS } from "#domain/shipping/operations/builders.ts";

type Builders = (typeof BUILDERS)[keyof typeof BUILDERS];
type InputFor<K extends keyof Builders> = Parameters<Builders[K]>[0];

// Exported for callers that assemble this input themselves rather than receiving it whole - domain/shipping/operations/service.ts builds the two addresses for a rate quote from one address plus a direction. Derived here so it can't drift from the builder's own shape.
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
  // provider.createPickup, not schedulePickup - fedex.ts never exported that name, so calling it threw before any FedEx request was built.
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
