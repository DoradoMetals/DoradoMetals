import withTransaction from "#shared/db/withTransaction.ts";
import * as services from "#db/shipping/services/repo.ts";
import * as rules from "#domain/shipping/rules.ts";
import {
  carrierIdOr,
  resolveCarrier,
} from "#domain/shipping/operations/resolver.ts";

import type { Executor } from "#shared/db/executor.ts";
import type {
  CarrierServiceOption, CarrierServicePatch, CarrierServiceRead,
  CarrierServiceWrite, LabelService, SaleShippingService,
} from "@dorado/contracts";

function toNewRow(body: CarrierServicePatch): CarrierServiceWrite {
  return {
    carrier_id: body.carrier_id ?? null,
    name: body.name ?? "",
    description: body.description ?? null,
    code: body.code ?? null,
    provider_code: body.provider_code ?? null,
    supports_pickups: body.supports_pickup ?? false,
    supports_dropoffs: body.supports_dropoff ?? true,
    supports_returns: body.supports_returns ?? false,
    supports_insurance: body.supports_insurance ?? false,
    is_international: body.is_international ?? false,
    is_residential: body.is_residential ?? true,
    is_active: body.is_active ?? true,
    max_weight_lb: body.max_weight_lbs ?? null,
    max_length_in: body.max_length_in ?? null,
    max_width_in: body.max_width_in ?? null,
    max_height_in: body.max_height_in ?? null,
    max_declared_value: body.max_declared_value ?? null,
    min_transit_days: body.min_transit_days ?? 0,
    max_transit_days: body.max_transit_days ?? 0,
    display_order: body.display_order ?? 0,
  };
}

function toPatchRow(body: CarrierServicePatch): Partial<CarrierServiceWrite> {
  return {
    carrier_id: body.carrier_id, name: body.name, description: body.description,
    code: body.code, provider_code: body.provider_code,
    supports_pickups: body.supports_pickup, supports_dropoffs: body.supports_dropoff,
    supports_returns: body.supports_returns, supports_insurance: body.supports_insurance,
    is_international: body.is_international, is_residential: body.is_residential,
    is_active: body.is_active,
    max_weight_lb: body.max_weight_lbs, max_length_in: body.max_length_in,
    max_width_in: body.max_width_in, max_height_in: body.max_height_in,
    max_declared_value: body.max_declared_value,
    min_transit_days: body.min_transit_days, max_transit_days: body.max_transit_days,
    display_order: body.display_order,
  };
}

export async function getAllServices(): Promise<CarrierServiceRead[]> {
  return await services.getAll();
}

export async function getSaleOptions(): Promise<SaleShippingService[]> {
  return await services.getSaleOptions();
}

export async function getOfferedServices(
  carrier_id?: string | null, client?: Executor
): Promise<CarrierServiceOption[]> {
  const id = await carrierIdOr(carrier_id, client);
  const { catalogue } = await resolveCarrier(id, client);
  const ceilings = await ceilingsByName(id, client);

  return [...catalogue.services]
    .sort((a, b) => a.display_order - b.display_order)
    .map((s) => ({
      code: s.code, name: s.name, carrier_code: s.carrier_code, display_order: s.display_order,
      id: ceilings.get(s.name)?.id ?? null,
      max_insured_value: ceilingOr(ceilings, s.name),
    }));
}

async function ceilingsByName(
  carrier_id: string, executor?: Executor
): Promise<Map<string, { id: string; ceiling: number }>> {
  const rows = await services.getInsuranceCeilings(carrier_id, executor);
  return new Map(rows.map((r) => [r.name, { id: r.id, ceiling: Number(r.max_insured_value) }]));
}

function lowestCeiling(ceilings: Map<string, { id: string; ceiling: number }>): number {
  const values = [...ceilings.values()].map((v) => v.ceiling).filter((v) => Number.isFinite(v));
  return values.length ? Math.min(...values) : 0;
}

function ceilingOr(ceilings: Map<string, { id: string; ceiling: number }>, name: string): number {
  const own = ceilings.get(name)?.ceiling;
  return own !== undefined && Number.isFinite(own) ? own : lowestCeiling(ceilings);
}

export async function insuranceCeiling(
  carrier_id?: string | null, client?: Executor
): Promise<number> {
  const id = await carrierIdOr(carrier_id, client);
  return lowestCeiling(await ceilingsByName(id, client));
}

export async function insuranceCeilingFor(
  code: string | null | undefined, carrier_id?: string | null, client?: Executor
): Promise<number> {
  const id = await carrierIdOr(carrier_id, client);
  const ceilings = await ceilingsByName(id, client);
  if (!code) return lowestCeiling(ceilings);

  const { catalogue } = await resolveCarrier(id, client);
  const offeredServices = catalogue.services;
  const offered = offeredServices.find((s) => s.code === code);
  return offered ? ceilingOr(ceilings, offered.name) : lowestCeiling(ceilings);
}

export async function clampInsuredValue(
  amount: unknown, code?: string | null, carrier_id?: string | null, client?: Executor
): Promise<number> {
  const ceiling = await insuranceCeilingFor(code, carrier_id, client);
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, ceiling);
}

export async function labelServiceFor(
  carrier_service_id: string, executor?: Executor
): Promise<LabelService> {
  const row = await services.getOne(carrier_service_id, executor);
  rules.assertLabelService(row, carrier_service_id);
  const offered = await getOfferedServices(row.carrier_id, executor);
  const entry = offered.find((o) => o.name.toLowerCase() === row.name.toLowerCase());
  rules.assertCatalogueEntry(entry, row.name);
  return { ...entry, carrier_id: row.carrier_id };
}

export async function getServiceById(
  id: string, executor?: Executor
): Promise<CarrierServiceRead | null> {
  return (await services.getOne(id, executor)) ?? null;
}

export async function getServicesByCarrierId(
  carrier_id: string, executor?: Executor
): Promise<CarrierServiceRead[]> {
  return await services.getByCarrier(carrier_id, executor);
}

export async function createService(body: CarrierServicePatch): Promise<CarrierServiceRead | null> {
  return await withTransaction(async (tx) => {
    return await services.create(toNewRow(body), tx);
  });
}

export async function updateService(body: CarrierServicePatch): Promise<CarrierServiceRead | null> {
  const id = body.id;
  rules.assertServiceId(id);
  return await withTransaction(async (tx) => {
    const changed = await services.update(id, toPatchRow(body), tx);
    if (!changed) return null;
    return (await services.getOne(id, tx)) ?? null;
  });
}

export async function removeService(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => {
    await services.remove(id, tx);
    return true;
  });
}
