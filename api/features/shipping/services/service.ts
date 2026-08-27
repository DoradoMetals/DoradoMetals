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
import withTransaction from "#shared/db/withTransaction.js";
import * as services from "#features/shipping/services/repo.ts";
import * as legacy from "#features/shipping/services/legacy.repo.ts";
import type { ServiceRow, ServiceValues, Executor } from "#features/shipping/services/repo.ts";

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
  created_by?: string | null;
  updated_by?: string | null;
};

// `== null` rather than a falsy check: `false` is a value a caller can send and
// must be kept, while undefined and null both mean "not supplied". The old
// update statement made exactly this distinction for supports_dropoff,
// is_residential and is_active and a plain `??` here would have flattened it.
const flag = (v: unknown, whenAbsent: boolean): boolean => (v == null ? whenAbsent : !!v);

export function toValues(s: ServiceInput): ServiceValues {
  return [
    s.carrier_id ?? null,
    s.name ?? null,
    s.description ?? null,
    s.code ?? null,
    s.provider_code ?? null,
    flag(s.supports_pickup, false),
    flag(s.supports_dropoff, true),
    flag(s.supports_returns, false),
    flag(s.supports_insurance, false),
    flag(s.is_international, false),
    flag(s.is_residential, true),
    flag(s.is_active, true),
    s.max_weight_lbs ?? null,
    s.max_length_in ?? null,
    s.max_width_in ?? null,
    s.max_height_in ?? null,
    s.max_declared_value ?? null,
    s.min_transit_days ?? 0,
    s.max_transit_days ?? 0,
    s.display_order ?? 0,
    s.created_by ?? "Dorado Metals",
    s.updated_by ?? "Dorado Metals",
  ];
}

export async function getAllServices(): Promise<ServiceRow[]> {
  return await services.getAll();
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
  const values = toValues(input);
  const run = async (c: Executor): Promise<ServiceRow | null> => {
    // ONE ID FOR BOTH SCHEMAS. Production already has all eight services under
    // matching ids in both tables; a new one has to keep that true, and the
    // only way to is to choose the id before either INSERT rather than letting
    // each table's DEFAULT gen_random_uuid() pick its own.
    const id = randomUUID();
    const row = await services.create(id, values, c);
    await legacy.create(id, values, c);
    return row ?? null;
  };
  return executor ? await run(executor) : await withTransaction(run);
}

export async function updateService(
  input: ServiceInput, executor?: Executor
): Promise<ServiceRow | null> {
  const id = input.id;
  if (!id) return null;
  const values = toValues(input);

  const run = async (c: Executor): Promise<ServiceRow | null> => {
    const row = await services.update(id, values, c);
    if (!row) return null;
    await legacy.update(id, values, c);
    return row;
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
    await legacy.remove(id, c);
    return true;
  };
  return executor ? await run(executor) : await withTransaction(run);
}
