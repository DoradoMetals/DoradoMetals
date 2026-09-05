import * as rules from "#domain/pricing/rules.ts";
import type { Bids, OrderView, OrderViewItem } from "@dorado/contracts";

export type { Bids } from "@dorado/contracts";

export function inboundShipment(view: OrderView): OrderView["shipments"][number] | null {
  return view.shipments.find((s) => s.direction !== "Return") ?? null;
}

export function effectivePayoutFee(order: OrderView): number {
  if (order.totals?.waive_payout_fee === true) return 0;
  return rules.feeOf(order.payout?.cost, "the payout fee");
}

export function recordedContent(line: OrderViewItem): number | null {
  return line.content ?? null;
}

export function unitContent(line: OrderViewItem): number {
  const content = recordedContent(line);
  if (content == null) {
    rules.assertRecordedContent(line);
    return 0;
  }
  return Number(content);
}

export function unitsOf(line: OrderViewItem): number {
  if (line.bullion_id === null) return 1;
  const quantity = Number(line.quantity ?? 1);
  return Number.isFinite(quantity) ? quantity : 1;
}

export function unitPrice(line: OrderViewItem, bids: Bids): number {
  if (line.price != null) return line.price;
  rules.assertQuoted(bids, line);
  return unitContent(line) * ((bids.get(line.metal_id) ?? 0) * (line.premium ?? 0));
}

export function linePrice(line: OrderViewItem, bids: Bids): number {
  return unitPrice(line, bids) * unitsOf(line);
}

export function itemsTotal(lines: OrderViewItem[], bids: Bids): number {
  return lines.reduce((sum, line) => sum + linePrice(line, bids), 0);
}

export function scrapLines(lines: OrderViewItem[]): OrderViewItem[] {
  return lines.filter((line) => line.bullion_id === null);
}

export function bullionLines(lines: OrderViewItem[]): OrderViewItem[] {
  return lines.filter((line) => line.bullion_id !== null);
}

export function calculateTotalPrice(view: OrderView, bids: Bids): number {
  const metal = itemsTotal(view.items, bids);
  const shipping = rules.feeOf(inboundShipment(view)?.cost, "the shipping charge");
  const total = metal - shipping - effectivePayoutFee(view);
  rules.assertFinite(total, "the order total");
  return total;
}

export function calculateReturnDeclaredValue(view: OrderView, bids: Bids): number {
  const total = itemsTotal(view.items, bids);
  rules.assertFinite(total, "the return declared value");
  return total;
}
