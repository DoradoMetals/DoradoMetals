// shipping.tracking: one row per carrier scan event. `time` aliases back to the wire's `scan_time`.
// No getOne/update - immutable facts, replaced wholesale each poll (remove, then insert); `insert` is a genuine UNNEST bulk write, not N calls to a single-row create.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { TrackingRecord } from "@dorado/contracts";
// The carrier's own payload, parsed - somebody else's shape, so it lives with
// the adapter that reads it rather than in a package of our columns.
import type { ParsedTracking, TrackingEvent } from "#providers/shipments/utils/parsing.ts";

const sql = sqlFrom(import.meta.dirname);

// A scan event as the wire carries it - `scan_time`, not `time`.
type ScanEventRow = Omit<TrackingRecord, "time"> & { scan_time: Date | string | null };

export async function getFor(
  shipment_id: string, executor?: Executor
): Promise<ScanEventRow[]> {
  const { rows } = await query<ScanEventRow>(sql("get_for"), [shipment_id], executor);
  return rows;
}

export async function remove(shipment_id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [shipment_id], executor);
  return r.rowCount ?? 0;
}

// Four parallel arrays rather than a row per event - see sql/insert.sql.
export function columnsOf(
  events: TrackingEvent[], shipment_id: string
): [string[], (string | null)[], (string | null)[], (string | null)[]] {
  return [
    new Array(events.length).fill(shipment_id),
    events.map((e) => e.status ?? null),
    events.map((e) => e.location ?? null),
    events.map((e) => e.date ?? null),
  ];
}

export async function insert(
  events: TrackingEvent[], shipment_id: string, executor?: Executor
): Promise<number> {
  if (!events.length) return 0;
  await query(sql("insert"), columnsOf(events, shipment_id), executor);
  return events.length;
}
