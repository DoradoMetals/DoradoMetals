// One call per shipping operation: resolve the carrier, build its request, send it. The repetition is the point - each function names an operation, so a carrier that can't do one fails at the call, not by omission (see createPickup).
// Input types are derived from the BUILDERS, not written here - InputFor<K> is whatever the builder accepts, so nothing has to be kept in step by hand.
// Not `unknown` (this layer inspects the value) and not one hand-written interface (it would describe FedEx's shape while claiming to be general). A second carrier turns `Builders` into a union and this stops compiling - deliberately, since two carriers wanting different shapes is a design conversation.
// `client` is the optional executor threaded through, like every repo call.
import { resolveCarrier } from "#domain/shipping/operations/resolver.ts";
import { BUILDERS } from "#domain/shipping/operations/builders.ts";
import type { Executor } from "#shared/db/executor.ts";

type Builders = (typeof BUILDERS)[keyof typeof BUILDERS];
type InputFor<K extends keyof Builders> = Parameters<Builders[K]>[0];

// The rate-quote input, derived from the BUILDER so it cannot drift from the
// carrier's own shape. A caller that assembles it itself (operations/service.ts
// builds the two addresses from one address plus a direction) reads it back as
// `Parameters<typeof getRates>[2]` rather than importing a name from here -
// there is no type home outside @dorado/contracts (rulings 57/60/61), and this
// one describes a PROVIDER's request, which is not one of our columns.

export async function validateAddress(
  carrier_id: string,
  client: Executor,
  { address }: InputFor<"validateAddress">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.validateAddress(builders.validateAddress({ address }));
}

export async function getRates(
  carrier_id: string,
  client: Executor,
  input: NonNullable<InputFor<"getRates">>
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getRates(builders.getRates(input));
}

export async function createLabel(
  carrier_id: string,
  client: Executor,
  input: InputFor<"createLabel">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.createLabel(builders.createLabel(input));
}

export async function cancelLabel(
  carrier_id: string,
  client: Executor,
  input: InputFor<"cancelLabel">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.cancelLabel(builders.cancelLabel(input));
}

export async function checkPickup(
  carrier_id: string,
  client: Executor,
  input: InputFor<"checkPickup">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.checkPickup(builders.checkPickup(input));
}

export async function createPickup(
  carrier_id: string,
  client: Executor,
  input: InputFor<"createPickup">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  // provider.createPickup, not schedulePickup - fedex.ts never exported that name, so calling it threw before any FedEx request was built.
  return await provider.createPickup(builders.createPickup(input));
}

export async function cancelPickup(
  carrier_id: string,
  client: Executor,
  input: InputFor<"cancelPickup">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.cancelPickup(builders.cancelPickup(input));
}

export async function getLocations(
  carrier_id: string,
  client: Executor,
  input: InputFor<"getLocations">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getLocations(builders.getLocations(input));
}

export async function getTracking(
  carrier_id: string,
  client: Executor,
  input: InputFor<"getTracking">
) {
  const { provider, builders } = await resolveCarrier(carrier_id, client);
  return await provider.getTracking(builders.getTracking(input));
}
