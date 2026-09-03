// shipping.tracking, and nothing else. One row per carrier scan event.
//
// The history a customer sees. `time` is this schema's name for exchange's
// `scan_time`, and the read aliases it back because the response has always
// carried scan_time.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// A scan event as the wire carries it - scan_time, not time.
type ScanEventRow = {
  id: string;
  shipment_id: string;
  status: string | null;
  location: string | null;
  scan_time: Date | string | null;
};

// A scan event as FedEx returns it. Deliberately loose: this is somebody
// else's payload, and narrowing it would be asserting a shape we do not
// control. The three fields read are the only three used.
export interface ScanEvent {
  status?: string | null;
  location?: string | null;
  date?: string | null;
}

export interface TrackingInfo {
  scanEvents?: ScanEvent[];
}

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
  events: ScanEvent[], shipment_id: string
): [string[], (string | null)[], (string | null)[], (string | null)[]] {
  return [
    new Array(events.length).fill(shipment_id),
    events.map((e) => e.status ?? null),
    events.map((e) => e.location ?? null),
    events.map((e) => e.date ?? null),
  ];
}

export async function insert(
  events: ScanEvent[], shipment_id: string, executor?: Executor
): Promise<number> {
  if (!events.length) return 0;
  await query(sql("insert"), columnsOf(events, shipment_id), executor);
  return events.length;
}
