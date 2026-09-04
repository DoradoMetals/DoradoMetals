// Defaults are applied here explicitly, not by the columns: shipping.services' column defaults disagree with what exchange's always meant (supports_dropoff/is_residential defaulted true there, false here), so every write states every value.
// A minimal (carrier_id, name) insert - what exchange's create did - would be refused here: several columns are NOT NULL with no default.
// Inputs are the CONTRACT'S types now, parsed strictly at transport - CarrierServicePatch/CarrierServicePatch, not a hand-typed "arrives as req.body" shape.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as services from "#db/shipping/services/repo.ts";
import {
  carrierIdOr,
  resolveCarrier,
} from "#domain/shipping/operations/resolver.ts";
import type { ServiceRow } from "#db/shipping/services/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
// From the contracts, not the adapter (which merely re-exports it) - contracts is where the shape is declared.
import type { CarrierServiceOption, CarrierServicePatch } from "@dorado/contracts";
import { Invalid } from "#shared/errors.ts";


// Every field spelled explicitly, by name - no prop-spreading, so the repo
// call never receives a field it wasn't written to expect.
function toNewRow(body: CarrierServicePatch, id: string): services.ServiceNew {
  return {
    id,
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

// A key PRESENT is written, a key ABSENT is left alone (shared/db/patch.ts) -
// the admin form sends every field today, but the patch itself no longer
// forces that.
function toPatchRow(body: CarrierServicePatch): services.ServicePatch {
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

export async function getAllServices(): Promise<ServiceRow[]> {
  return await services.getAll();
}

// The sale delivery options: business-created, carrier-agnostic, priced - the customer picks the service at its fixed price, the REFINERY picks the carrier. Not getOfferedServices (the purchase side's carrier catalogue).
// Prices here are DISPLAY - getShippingCharge (domain/pricing/ask.ts) remains the pricing authority, pinned by pricing's own reference-drift test.
export async function getSaleOptions(): Promise<services.SaleServiceOption[]> {
  return await services.getSaleOptions();
}

// The services checkout offers, not the same list as shipping.services' rows (eight rows across two carriers; checkout offers two).
// Read from the carrier's catalogue, not this table: code/provider_code are NULL on every row (an UPDATE against production, Jacob's to run) - the read lives here so the URL doesn't move once they're filled.
// `code` on the way out is the carrier's SERVICE type (matches a rate quote's serviceType); `carrier_code` is the service family FedEx wants for pickup availability.
export async function getOfferedServices(
  carrier_id?: string | null, client?: Executor
): Promise<CarrierServiceOption[]> {
  const id = await carrierIdOr(carrier_id, client);
  const { catalogue } = await resolveCarrier(id, client);
  const ceilings = await ceilingsByName(id, client);

  return [...catalogue.services]
    .sort((a, b) => a.display_order - b.display_order)
    // `id` is the shipping.services row for this catalogue entry, joined by name like the ceiling - checkout stores it, and create resolves the entry back from it.
    .map((s) => ({
      code: s.code, name: s.name, carrier_code: s.carrier_code, display_order: s.display_order,
      id: ceilings.get(s.name)?.id ?? null,
      max_insured_value: ceilingOr(ceilings, s.name),
    }));
}

// ---------------------------------------------------------- insurance ceiling
//
// What a parcel may be insured for is a row now, not a literal in the browser - set to 10,000 for every row today, which is Dorado's policy, not FedEx's limit.
// Two callers, different questions: insuranceCeiling() is service-agnostic (used before a service is chosen, so answers the LOWEST ceiling among what we offer); insuranceCeilingFor(code) narrows to one, resolved by name since code is NULL on every row today.
// Neither returns Infinity on a miss - a missing ceiling is a misconfiguration, and the safe reading is the most conservative number we know.
async function ceilingsByName(
  carrier_id: string, executor?: Executor
): Promise<Map<string, { id: string; ceiling: number }>> {
  const rows = await services.getInsuranceCeilings(carrier_id, executor);
  return new Map(rows.map((r) => [r.name, { id: r.id, ceiling: Number(r.max_insured_value) }]));
}

// The lowest ceiling we know about - the agnostic answer and the fallback for an unrecognized service. Zero rows means nothing can be shipped or insured.
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

// `code` is the carrier's service type - CarrierServiceOption.code, which is
// what the browser round-trips back as `service.serviceType`.
export async function insuranceCeilingFor(
  code: string | null | undefined, carrier_id?: string | null, client?: Executor
): Promise<number> {
  const id = await carrierIdOr(carrier_id, client);
  const ceilings = await ceilingsByName(id, client);
  if (!code) return lowestCeiling(ceilings);

  const { catalogue } = await resolveCarrier(id, client);
  // Bound to a local first: `catalogue.services.find(...)` reads as a call on
  // the `services` repo namespace imported at the top of this file, and
  // lint:namespace-calls says so.
  const offeredServices = catalogue.services;
  const offered = offeredServices.find((s) => s.code === code);
  return offered ? ceilingOr(ceilings, offered.name) : lowestCeiling(ceilings);
}

// The clamp itself, in one place so the two call sites cannot disagree. A
// non-finite or absent amount insures nothing rather than everything.
export async function clampInsuredValue(
  amount: unknown, code?: string | null, carrier_id?: string | null, client?: Executor
): Promise<number> {
  const ceiling = await insuranceCeilingFor(code, carrier_id, client);
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, ceiling);
}

// THE CARRIER FACTS BEHIND ONE shipping.services ROW, resolved from its id.
//
// A label needs three things this table does not hold: which carrier buys it,
// the carrier's own service TYPE (what a rate quote's serviceType is) and the
// service FAMILY it belongs to. All three live in the carrier's catalogue,
// joined to the row by name - see getOfferedServices' header for why the
// catalogue is the source rather than the columns.
//
// It lives here because carriers belong to shipping: orders used to spell a
// FedEx carrier id as a constant and re-resolve the catalogue itself, once in
// placement and once in cancellation.
export type LabelService = {
  carrier_id: string;
  name: string;
  serviceType: string;
  carrierCode: string;
};

export async function labelServiceFor(
  carrier_service_id: string, executor?: Executor
): Promise<LabelService> {
  const row = await services.getOne(carrier_service_id, executor);
  if (!row) throw new Invalid("that carrier service does not exist");
  if (!row.carrier_id) {
    throw new Invalid(`${row.name} is a sale delivery service, not a label service`);
  }
  const offered = await getOfferedServices(row.carrier_id, executor);
  const entry = offered.find((o) => o.name.toLowerCase() === row.name.toLowerCase());
  if (!entry) {
    throw new Invalid(`${row.name} is not a label service the carrier offers`);
  }
  return {
    carrier_id: row.carrier_id,
    name: row.name,
    serviceType: entry.code,
    carrierCode: entry.carrier_code,
  };
}

export async function getServiceById(
  id: string, executor?: Executor
): Promise<ServiceRow | null> {
  return (await services.getOne(id, executor)) ?? null;
}

export async function getServicesByCarrierId(
  carrier_id: string, executor?: Executor
): Promise<ServiceRow[]> {
  return await services.getByCarrier(carrier_id, executor);
}

// A USE CASE (ruling 56): only the controller calls this.
export async function createService(body: CarrierServicePatch): Promise<ServiceRow | null> {
  return await withTransaction(async (tx) => {
    const id = randomUUID();
    return await services.create(toNewRow(body, id), tx);
  });
}

// A USE CASE, same reasoning as createService.
export async function updateService(body: CarrierServicePatch): Promise<ServiceRow | null> {
  // The id is the message on an update; every column beside it is optional
  // because a create sends this same patch.
  const id = body.id;
  if (!id) throw new Invalid("id is required");
  return await withTransaction(async (tx) => {
    const changed = await services.update(id, toPatchRow(body), tx);
    if (!changed) return null;
    return (await services.getOne(id, tx)) ?? null;
  });
}

// Deleting is stricter than it was, and that's the database's doing: shipping.shipments.carrier_service_id and checkout.checkouts.carrier_service_id reference this table with no ON DELETE, so removing a service something points at raises 23503 - exchange had no such reference.
// Not a regression in practice: this endpoint had never once succeeded, since the controller passed the whole body where an id was wanted.
// A USE CASE, same reasoning as createService.
export async function removeService(id: string): Promise<boolean> {
  return await withTransaction(async (tx) => {
    await services.remove(id, tx);
    return true;
  });
}
