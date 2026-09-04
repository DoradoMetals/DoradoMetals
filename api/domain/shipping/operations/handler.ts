import { resolveCarrier } from "#domain/shipping/operations/resolver.ts";
import { BUILDERS } from "#domain/shipping/operations/builders.ts";
import type { Executor } from "#shared/db/executor.ts";

type Builders = (typeof BUILDERS)[keyof typeof BUILDERS];
type InputFor<K extends keyof Builders> = Parameters<Builders[K]>[0];

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
