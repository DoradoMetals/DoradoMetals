import { Invalid } from "#shared/errors.ts";
import type { Bids, OrderViewItem } from "@dorado/contracts";

export function feeOf(value: unknown, what: string): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError(`${what} is not a number: ${String(value)}`);
  }
  return n;
}

export function assertFinite(total: number, what: string): void {
  if (!Number.isFinite(total)) {
    throw new TypeError(`${what} did not come out as a number (${String(total)})`);
  }
}

export function assertRecordedContent(line: OrderViewItem): void {
  if (line.bullion_id !== null) {
    throw new Invalid(`line ${line.id} has no recorded content`);
  }
}

export function assertQuoted(bids: Bids, line: OrderViewItem): void {
  if (!bids.has(line.metal_id)) {
    throw new TypeError(
      `no quote for metal ${line.metal_id}, so line ${line.id} cannot be priced`
    );
  }
}
