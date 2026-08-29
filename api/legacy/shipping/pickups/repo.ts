// exchange.carrier_pickups. THIS FILE IS SCHEDULED FOR DELETION.
//
// exchange hangs a pickup off an ORDER and names its carrier inline, so this
// takes the user, the order and the carrier where the new schema takes a
// shipment.
//
// THE DATE AND TIME ARE PASSED SEPARATELY AND COMBINED IN POSTGRES. The caller
// has them apart because that is the shape the FedEx call takes, and
// `pickup_requested_at` is `timestamp WITHOUT time zone` - building a JS Date
// from them would carry the process timezone into a column that has none.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// The exchange row's own shape. Every field optional, because it arrives from
// a caller that has assembled it from a carrier response.
// THE TYPES ADMIT WHAT CALLERS ACTUALLY PASS. `pickup_requested_at` is
// `Date | string` because cancelPickup spreads a pickup it just read, and pg
// has already parsed that column. `confirmation_number` is `string | number`
// because the carrier returns a string and exchange's column is numeric, so
// both forms reach here honestly. Narrowing either would be a claim about the
// caller that the compiler immediately disproves.
export type LegacyPickup = {
  user_id?: string | null;
  order_id?: string | null;
  carrier?: string | null;
  pickup_requested_at?: Date | string | null;
  date?: string | null;
  time?: string | null;
  pickup_status?: string | null;
  confirmation_number?: string | number | null;
  location?: string | null;
};

// The ten values both statements take, in their order. $4/$5/$6 are the three
// ways a time can arrive - a ready-made timestamp, or a date and a time.
const values = (id: string, p: LegacyPickup, defaultStatus: string | null) => [
  id,
  p.user_id ?? null,
  p.order_id ?? null,
  p.pickup_requested_at ?? null,
  p.date ?? null,
  p.time ?? null,
  p.carrier ?? null,
  p.pickup_status ?? defaultStatus,
  p.confirmation_number ?? null,
  p.location ?? null,
];

// The create defaults pickup_status to 'Scheduled' and the update does not -
// that asymmetry is exactly what the two statements this replaces did, and it
// is right: a new pickup with no status given is scheduled, while an update
// with no status given should not invent one.
// BOTH RETURN THE TIMESTAMP exchange COMPUTED. The caller may have passed a
// date and a time, which the statement combines in Postgres; the new schema
// needs that same instant, and recomputing it in JavaScript would carry the
// process timezone into a column that has none. Returning it is how the value
// crosses without a second read - this file still only writes.
export type Written = { id: string; pickup_requested_at: Date | string | null };

export async function create(
  id: string, p: LegacyPickup, executor?: Executor
): Promise<Written | undefined> {
  const { rows } = await query<Written>(
    sql("create"), values(id, p, "Scheduled"), executor
  );
  return rows[0];
}

export async function update(
  id: string, p: LegacyPickup, executor?: Executor
): Promise<Written | undefined> {
  const { rows } = await query<Written>(sql("update"), values(id, p, null), executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("delete"), [id], executor);
}
