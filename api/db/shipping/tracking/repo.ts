import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { TrackingRecord } from "@dorado/contracts";
import type { ParsedTracking, TrackingEvent } from "#providers/shipments/utils/parsing.ts";

const sql = sqlFrom(import.meta.dirname);

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
