// exchange.tracking_events. THIS FILE IS SCHEDULED FOR DELETION.
//
// Same two statements, and the only difference is the column name: exchange
// calls it scan_time and the new schema calls it time.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf } from "#features/shipping/tracking/repo.ts";
import type { Executor, ScanEvent } from "#features/shipping/tracking/repo.ts";

const sql = sqlFrom(import.meta.dirname);

export async function remove(shipment_id: string, executor?: Executor): Promise<number> {
  const r = await query(sql("delete"), [shipment_id], executor);
  return r.rowCount ?? 0;
}

export async function insert(
  events: ScanEvent[], shipment_id: string, executor?: Executor
): Promise<number> {
  if (!events.length) return 0;
  await query(sql("insert"), columnsOf(events, shipment_id), executor);
  return events.length;
}
