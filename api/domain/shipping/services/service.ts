// Carrier services: one row in each schema, written together.
//
// THE DEFAULTS ARE APPLIED HERE, NOT BY THE COLUMNS, AND THAT IS DELIBERATE.
//
// The two tables disagree about what a missing value means:
//
//                       exchange.carrier_services   shipping.services
//   supports_dropoff*   DEFAULT true                DEFAULT false
//   is_residential      DEFAULT true                DEFAULT false
//   created_by          DEFAULT 'Dorado Metals'     no default, nullable
//
// Both statements list every column explicitly, so neither default is ever
// reached - which is the only way the two rows can be made to agree. The values
// below are exchange's, because exchange is the behaviour that must not change.
//
// The old exchange create inserted (carrier_id, name) ALONE and let the column
// defaults fill the rest. Writing the same minimal row into shipping.services
// would have been refused outright: supports_pickups, supports_dropoffs,
// supports_returns, supports_insurance, is_international, is_residential and
// is_active are all NOT NULL there. So a service created through this path now
// carries the same values it always did, just stated rather than defaulted.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.ts";
import * as services from "#db/shipping/services/repo.ts";
import {
  carrierIdOr,
  resolveCarrier,
} from "#domain/shipping/operations/resolver.ts";
import type { ServiceRow, ServiceWrite } from "#db/shipping/services/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
// From the contracts, which is where the shape is declared - not via the
// adapter, which merely re-exports it for a reader of that file.
import type { CarrierServiceOption } from "@dorado/contracts";

export type { CarrierServiceOption };

// Arrives as req.body, so everything is optional and nothing can be trusted to
// be the type it looks like.
export type ServiceInput = {
  id?: string;
  carrier_id?: string | null;
  name?: string | null;
  description?: string | null;
  code?: string | null;
  provider_code?: string | null;
  supports_pickup?: unknown;
  supports_dropoff?: unknown;
  supports_returns?: unknown;
  supports_insurance?: unknown;
  is_international?: unknown;
  is_residential?: unknown;
  is_active?: unknown;
  max_weight_lbs?: number | null;
  max_length_in?: number | null;
  max_width_in?: number | null;
  max_height_in?: number | null;
  max_declared_value?: number | null;
  min_transit_days?: number | null;
  max_transit_days?: number | null;
  display_order?: number | null;
};

// `== null` rather than a falsy check: `false` is a value a caller can send and
// must be kept, while undefined and null both mean "not supplied". The old
// update statement made exactly this distinction for supports_dropoff,
// is_residential and is_active and a plain `??` here would have flattened it.
const flag = (v: unknown, whenAbsent: boolean): boolean => (v == null ? whenAbsent : !!v);

// The business's defaults, applied here rather than by the columns (see the
// file header for why) - and now BY NAME, one object repo.ts spells onto each
// statement in exactly one place, replacing the positional array both create
// and update used to share by accident of column order.
//
// TWO BUILDERS, NOT ONE SPREAD OVER THE OTHER (Jacob's no-prop-spreading
// ruling): toNewRow and toPatchRow each spell every field of the object they
// return by name, so neither ever forwards a field the repo call was not
// written to expect.
function writeFields(s: ServiceInput): ServiceWrite {
  return {
    carrier_id: s.carrier_id ?? null,
    // shipping.services.name is NOT NULL; a caller omitting it is a pre-
    // existing gap this layer never validated (the DB constraint has always
    // been the actual guard) - not something this conversion introduces.
    name: (s.name ?? null) as string,
    description: s.description ?? null,
    code: s.code ?? null,
    provider_code: s.provider_code ?? null,
    supports_pickups: flag(s.supports_pickup, false),
    supports_dropoffs: flag(s.supports_dropoff, true),
    supports_returns: flag(s.supports_returns, false),
    supports_insurance: flag(s.supports_insurance, false),
    is_international: flag(s.is_international, false),
    is_residential: flag(s.is_residential, true),
    is_active: flag(s.is_active, true),
    max_weight_lb: s.max_weight_lbs ?? null,
    max_length_in: s.max_length_in ?? null,
    max_width_in: s.max_width_in ?? null,
    max_height_in: s.max_height_in ?? null,
    max_declared_value: s.max_declared_value ?? null,
    min_transit_days: s.min_transit_days ?? 0,
    max_transit_days: s.max_transit_days ?? 0,
    display_order: s.display_order ?? 0,
  };
}

function toNewRow(s: ServiceInput, id: string): services.ServiceNew {
  const w = writeFields(s);
  return {
    id,
    carrier_id: w.carrier_id, name: w.name, description: w.description,
    code: w.code, provider_code: w.provider_code,
    supports_pickups: w.supports_pickups, supports_dropoffs: w.supports_dropoffs,
    supports_returns: w.supports_returns, supports_insurance: w.supports_insurance,
    is_international: w.is_international, is_residential: w.is_residential,
    is_active: w.is_active,
    max_weight_lb: w.max_weight_lb, max_length_in: w.max_length_in,
    max_width_in: w.max_width_in, max_height_in: w.max_height_in,
    max_declared_value: w.max_declared_value,
    min_transit_days: w.min_transit_days, max_transit_days: w.max_transit_days,
    display_order: w.display_order,
  };
}

function toPatchRow(s: ServiceInput): services.ServicePatch {
  const w = writeFields(s);
  return {
    carrier_id: w.carrier_id, name: w.name, description: w.description,
    code: w.code, provider_code: w.provider_code,
    supports_pickups: w.supports_pickups, supports_dropoffs: w.supports_dropoffs,
    supports_returns: w.supports_returns, supports_insurance: w.supports_insurance,
    is_international: w.is_international, is_residential: w.is_residential,
    is_active: w.is_active,
    max_weight_lb: w.max_weight_lb, max_length_in: w.max_length_in,
    max_width_in: w.max_width_in, max_height_in: w.max_height_in,
    max_declared_value: w.max_declared_value,
    min_transit_days: w.min_transit_days, max_transit_days: w.max_transit_days,
    display_order: w.display_order,
  };
}

export async function getAllServices(): Promise<ServiceRow[]> {
  return await services.getAll();
}

// THE SALE DELIVERY OPTIONS (D208). Business-created services, carrier-
// agnostic and priced - Jacob: the customer picks the service at its fixed
// price, and THE REFINERY picks the carrier, recorded on the shipment. Not
// getOfferedServices: that is the PURCHASE side's carrier catalogue (the
// FedEx services an inbound label can be bought for).
//
// Prices here are DISPLAY - getShippingCharge (features/pricing/ask.ts)
// remains the pricing authority, and features/pricing/tests/reference-drift
// pins these rows to its constants.
export async function getSaleOptions(): Promise<services.SaleServiceOption[]> {
  return await services.getSaleOptions();
}

// THE SERVICES WE OFFER AT CHECKOUT, which is not the same list as the rows.
//
// shipping.services holds eight rows across two carriers - Free, Overnight,
// Standard, Express Saver, Priority Overnight - and checkout offers exactly
// two. The browser used to decide which two, from a literal keyed by FedEx's
// own service types (FEDEX_EXPRESS_SAVER, PRIORITY_OVERNIGHT) carrying FedEx's
// FDXE carrier code, so a rate quote was filtered against a carrier's
// vocabulary compiled into React.
//
// IT COMES FROM THE CARRIER'S CATALOGUE AND NOT FROM THIS TABLE, TODAY, AND THE
// REASON IS DATA: `code` and `provider_code` are NULL on all eight rows in
// production and all eight in dev, so no row can say which FedEx service it
// means. Filling them is an UPDATE against production, which is Jacob's to run
// and not a migration this wave writes. The read lives here - on the resource
// that owns carrier services - so that when the columns are populated this
// function changes where it reads and the URL does not move.
//
// The `code` on the way out is the carrier's SERVICE type, which is what a rate
// quote's serviceType matches; `carrier_code` is the service family FedEx wants
// on a pickup-availability check and differs between express and ground.
export async function getOfferedServices(
  carrier_id?: string | null, client?: unknown
): Promise<CarrierServiceOption[]> {
  const id = await carrierIdOr(carrier_id, client);
  const { catalogue } = await resolveCarrier(id, client);
  const ceilings = await ceilingsByName(id, client as Executor);

  return [...catalogue.services]
    .sort((a, b) => a.display_order - b.display_order)
    // `id` is the shipping.services ROW for this catalogue entry, joined by
    // name like the ceiling - the checkout row stores it (D208), and the
    // create resolves the entry back from it.
    .map((s) => ({
      ...s,
      id: ceilings.get(s.name)?.id ?? null,
      max_insured_value: ceilingOr(ceilings, s.name),
    }));
}

// ---------------------------------------------------------- insurance ceiling
//
// WHAT A PARCEL MAY BE INSURED FOR IS A ROW NOW, NOT A LITERAL IN THE BROWSER.
// D132: `checkoutStepper.tsx` held `Math.min(quote.declared_value, 50000)` -
// FedEx's ceiling, hard-coded in React, deciding what a parcel of metal is
// covered for. Migration 097 puts the number on shipping.services and Jacob set
// it to 10,000 for every row, which is Dorado's policy and not FedEx's limit.
//
// TWO CALLERS, AND THEY ANSWER DIFFERENT QUESTIONS:
//   - `insuranceCeiling()` is service-AGNOSTIC and is what /quotes/purchase_order
//     uses. A quote is priced before a service is chosen, so the honest answer
//     is the LOWEST ceiling among the services we offer: the quote may not
//     promise cover that the cheapest option would not carry.
//   - `insuranceCeilingFor(code)` narrows to one service and is what the label
//     path uses, where the customer has chosen. It cannot be resolved by `code`
//     today (NULL on every row, D125) so it resolves through the catalogue's
//     name, and falls back to the agnostic answer when the code is unknown.
//
// NEITHER RETURNS Infinity ON A MISS. A missing ceiling is a misconfiguration,
// and the only safe reading of "we do not know what this is covered for" is the
// most conservative number we do know.
async function ceilingsByName(
  carrier_id: string, executor?: Executor
): Promise<Map<string, { id: string; ceiling: number }>> {
  const rows = await services.getInsuranceCeilings(carrier_id, executor);
  return new Map(
    rows.map((r) => [r.name, { id: (r as { id?: string }).id as string, ceiling: Number(r.max_insured_value) }])
  );
}

// The lowest ceiling we know about, used both as the agnostic answer and as the
// fallback for a service with no row. Zero rows means the carrier has no active
// service at all, in which case nothing can be shipped and nothing is insured.
function lowestCeiling(ceilings: Map<string, { id: string; ceiling: number }>): number {
  const values = [...ceilings.values()].map((v) => v.ceiling).filter((v) => Number.isFinite(v));
  return values.length ? Math.min(...values) : 0;
}

function ceilingOr(ceilings: Map<string, { id: string; ceiling: number }>, name: string): number {
  const own = ceilings.get(name)?.ceiling;
  return own !== undefined && Number.isFinite(own) ? own : lowestCeiling(ceilings);
}

export async function insuranceCeiling(
  carrier_id?: string | null, client?: unknown
): Promise<number> {
  const id = await carrierIdOr(carrier_id, client);
  return lowestCeiling(await ceilingsByName(id, client as Executor));
}

// `code` is the carrier's service type - CarrierServiceOption.code, which is
// what the browser round-trips back as `service.serviceType`.
export async function insuranceCeilingFor(
  code: string | null | undefined, carrier_id?: string | null, client?: unknown
): Promise<number> {
  const id = await carrierIdOr(carrier_id, client);
  const ceilings = await ceilingsByName(id, client as Executor);
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
  amount: unknown, code?: string | null, carrier_id?: string | null, client?: unknown
): Promise<number> {
  const ceiling = await insuranceCeilingFor(code, carrier_id, client);
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, ceiling);
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

export async function createService(
  input: ServiceInput, executor?: Executor
): Promise<ServiceRow | null> {
  const run = async (c: Executor): Promise<ServiceRow | null> => {
    // ONE ID FOR BOTH SCHEMAS. Production already has all eight services under
    // matching ids in both tables; a new one has to keep that true, and the
    // only way to is to choose the id before either INSERT rather than letting
    // each table's DEFAULT gen_random_uuid() pick its own.
    const id = randomUUID();
    return await services.create(toNewRow(input, id), c);
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function updateService(
  input: ServiceInput, executor?: Executor
): Promise<ServiceRow | null> {
  const id = input.id;
  if (!id) return null;

  const run = async (c: Executor): Promise<ServiceRow | null> => {
    const changed = await services.update(id, toPatchRow(input), c);
    if (!changed) return null;
    return (await services.getOne(id, c)) ?? null;
  };
  return executor ? await run(executor) : await withTransaction(run);
}

// DELETING IS STRICTER THAN IT WAS, AND THAT IS THE DATABASE'S DOING.
//
// shipping.shipments.carrier_service_id and checkout.checkouts.carrier_service_id
// both reference this table with NO ON DELETE clause, so removing a service
// something still points at raises 23503 and the whole transaction - exchange's
// delete included - rolls back. exchange had no such reference and allowed it.
//
// That is the right behaviour and it is not a regression in practice: this
// endpoint had never once succeeded, because the controller passed the whole
// request body where an id was wanted and every delete died on `invalid input
// syntax for type uuid`.
export async function removeService(id: string, executor?: Executor): Promise<boolean> {
  const run = async (c: Executor): Promise<boolean> => {
    await services.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
