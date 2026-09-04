import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { fineContent } from "#domain/pricing/content.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";

import type {
  BullionStorefront, CheckoutMissing, Direction, OrderActions, OrderItem, OrderItemPatch,
  OrderLine, OrderTotals, OrderView, PaymentIntentFacts, PaymentMethod, PricedLine,
  SaleLine, TaxedSaleLine,
} from "@dorado/contracts";

export function chargesSalesTax(direction: Direction): boolean {
  return direction === "sale";
}

export function directionOf(checkout: { direction: string }): Direction {
  return checkout.direction === "sale" ? "sale" : "purchase";
}

export function rateMaterialFor(line: { bullion_id?: string | null }): "scrap" | "bullion" {
  return line.bullion_id == null ? "scrap" : "bullion";
}

export function lineContent(line: Pick<PricedLine, "content" | "quantity" | "bullion_id">): number {
  const content = Number(line.content) || 0;
  if (line.bullion_id == null) return content;
  const quantity = Number(line.quantity ?? 1);
  return content * (Number.isFinite(quantity) ? quantity : 1);
}

export function retierPlan(
  rates: Parameters<typeof getRatePct>[0], lines: PricedLine[]
): { id: string; premium: number }[] {
  if (!rates?.length || !lines.length) return [];
  const totals = sumContentByMetal(lines, (l: PricedLine) => l.metal, lineContent);
  const plan: { id: string; premium: number }[] = [];
  for (const line of lines) {
    const total = totals[String(line.metal ?? "").toLowerCase()] ?? 0;
    const pct = getRatePct(rates, line.metal, total, rateMaterialFor(line));
    if (pct != null) plan.push({ id: line.id, premium: pct });
  }
  return plan;
}

export function saleLines(
  cart: OrderLine[], catalogue: BullionStorefront[], metals: Map<string, string>
): SaleLine[] {
  const soldById = new Map(catalogue.map((product) => [product.id, product]));
  return cart.map((line) => {
    const product = line.bullion_id === null ? undefined : soldById.get(line.bullion_id);
    if (!product) {
      throw new Invalid(
        `checkout item ${line.id} names no product the catalogue prices, so this ` +
          `sale cannot be placed`
      );
    }
    if (line.content == null) {
      throw new Invalid(
        `checkout item ${line.id} has no content, so it cannot be priced - ` +
          `refresh your basket and try again`
      );
    }
    return {
      id: product.id,
      quantity: Number(line.quantity ?? 1),
      metal_type: line.metal_id == null ? null : (metals.get(line.metal_id) ?? null),
      content: line.content,
      purity: line.purity,
      gross: line.pre_melt,
      ask_premium: product.ask_premium,
      type: product.type,
      legal_tender: product.legal_tender,
      domestic_tender: product.domestic_tender,
    };
  });
}

export function catalogueWanted(cart: OrderLine[]): { id: string; quantity: number }[] {
  const ids = new Set(
    cart.flatMap((line) => (line.bullion_id === null ? [] : [line.bullion_id]))
  );
  return [...ids].map((id) => ({ id, quantity: 0 }));
}

export function pricedSaleLines(
  cart: OrderLine[], priced: TaxedSaleLine[], askOf: (line: TaxedSaleLine) => number
): { line_id: string; premium: number; sales_tax: number; price: number }[] {
  return cart.map((line, index) => {
    const sold = priced[index];
    if (!sold) {
      throw new Error(`checkout item ${line.id} was not priced - the sale line list is short`);
    }
    return {
      line_id: line.id,
      premium: Number(sold.ask_premium ?? 0),
      sales_tax: sold.sales_tax_rate,
      price: askOf(sold),
    };
  });
}

export function declaredLot(declared: OrderItemPatch): OrderItemPatch & { metal_id: string } {
  assertDeclaredMetal(declared.metal_id);
  return Object.assign({}, declared, {
    metal_id: declared.metal_id,
    quantity: 1,
    confirmed: false,
    content: fineContent(declared.pre_melt, declared.unit, declared.purity),
  });
}

export function retiersAfterEdit(changes: OrderItemPatch): boolean {
  if (changes.premium !== undefined) return false;
  return (
    changes.pre_melt !== undefined ||
    changes.post_melt !== undefined ||
    changes.purity !== undefined ||
    changes.unit !== undefined ||
    changes.quantity !== undefined
  );
}

export function isSettled(payment_status: string | null | undefined): boolean {
  return payment_status === "succeeded" || payment_status === "processing";
}

export function chargeCents(post_charges_amount: number): number {
  return Math.round(post_charges_amount * 100);
}

export const STRIPE_MINIMUM_CENTS = 50;

export function belowStripeMinimum(cents: number): boolean {
  return cents > 0 && cents < STRIPE_MINIMUM_CENTS;
}

export function statusAtPlacement(cents: number, alreadySucceeded: boolean): string {
  return cents > 0 && !alreadySucceeded ? "Pending" : "Preparing";
}

export function attachmentVerdict(
  intent: Partial<Pick<PaymentIntentFacts, "order_id" | "direction" | "payment_status">>
): "proceed" | "supersede" | "conflict" {
  if (!intent.order_id) return "proceed";
  if (intent.direction === "purchase") return "conflict";
  return isSettled(intent.payment_status) ? "conflict" : "supersede";
}

export function repairAmountMatches(
  intent_amount: number | string | null | undefined, cents: number
): boolean {
  return Number(intent_amount) === cents;
}

export function payoutFeeOf(
  methods: PaymentMethod[], payment_method_id: string | null
): number {
  return Number(methods.find((m) => m.id === payment_method_id)?.flat_fee ?? 0);
}

export function payableOf(
  line: { content?: number | null; premium?: number | null }
): number | null {
  if (line.content == null || line.premium == null) return null;
  return Number(line.content) * Number(line.premium);
}

export function lineTotalOf(
  line: { price?: number | null; quantity?: number | null; bullion_id?: string | null }
): number | null {
  if (line.price == null) return null;
  if (line.bullion_id == null) return Number(line.price);
  return Number(line.price) * Number(line.quantity ?? 1);
}

const PURCHASE_LADDER: Record<string, string[]> = {
  "In Transit": ["Received", "Cancelled"],
  Received: ["Payment Processing", "In Transit", "Cancelled"],
  "Payment Processing": ["Completed", "Received", "Cancelled"],
  Cancelled: ["Received"],
  Completed: ["Payment Processing"],
};

const SALE_LADDER: Record<string, string[]> = {
  Pending: ["Preparing"],
  Preparing: ["In Transit", "Pending"],
  "In Transit": ["Completed", "Preparing"],
  Completed: ["In Transit"],
};

export function allLinesConfirmed(items: { confirmed: boolean }[]): boolean {
  return items.length > 0 && items.every((item) => item.confirmed === true);
}

export function creditsToAccount(payoutMethod: string | null): boolean {
  return payoutMethod === "DORADO_ACCOUNT";
}

type Facts = Pick<
  OrderView["order"], "direction" | "status" | "order_sent" | "tracking_updated"
> & {
  hasAddress: boolean;
  hasTotal: boolean;
  items: { confirmed: boolean }[];
  shipments: { direction: string | null; tracking_number: string | null }[];
  payoutMethod: string | null;
};

export function statusesFor(facts: Facts): string[] {
  const ladder = facts.direction === "sale" ? SALE_LADDER : PURCHASE_LADDER;
  const offered = ladder[facts.status ?? ""] ?? [];
  return offered.filter((next) => {
    if (next === "Payment Processing" && facts.direction === "purchase") {
      return allLinesConfirmed(facts.items);
    }
    if (next === "In Transit" && facts.direction === "sale") {
      return facts.order_sent === true && facts.tracking_updated === true;
    }
    return true;
  });
}

export function actionsFor(facts: Facts): OrderActions {
  const purchase = facts.direction === "purchase";
  const sale = facts.direction === "sale";
  const inbound = facts.shipments.find((s) => s.direction === "Inbound");
  return {
    cancel: purchase && facts.hasAddress,
    finalize_pricing: purchase && allLinesConfirmed(facts.items),
    add_funds: purchase && facts.hasTotal && creditsToAccount(facts.payoutMethod),
    send_to_refiner: sale && facts.hasAddress,
    buy_label: purchase && !!inbound && !inbound.tracking_number,
    update_tracking: facts.shipments.length > 0,
    edit_lines: purchase,
    statuses: statusesFor(facts),
  };
}

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
}

export function assertOrder<T>(
  row: T | null | undefined, order_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no order ${order_id}`);
}

export function assertNamesASpotField(
  body: { lock?: boolean; set?: unknown[] }
): void {
  if (body.lock === undefined && !body.set) {
    throw new Invalid("the document names no field to write");
  }
}

export function assertLine<T>(
  row: T | null | undefined, line_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no order item ${line_id}`);
}

export function assertCatalogueProduct<T>(
  row: T | null | undefined, bullion_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no product ${bullion_id} to put on the order`);
}

export function assertDeclaredMetal(
  metal_id: string | null | undefined
): asserts metal_id is string {
  if (!metal_id) throw new Invalid("a declared lot needs a metal");
}

export function assertDirection(
  direction: Direction | null, wanted: Direction, operation: string
): void {
  if (direction === null) throw new Invalid(`${operation} needs an order with a direction`);
  if (direction !== wanted) {
    throw new Invalid(
      `${operation} is a ${wanted}-direction operation and this is a ${direction} order`
    );
  }
}

export function assertSendable(
  order: OrderView,
  { refiner_id, attachedRefinerId, refinerEmail }: {
    refiner_id: string;
    attachedRefinerId: string | null;
    refinerEmail: string | null | undefined;
  }
): void {
  if (!order.address) {
    throw new Invalid(
      `sales order ${order.order.number} has no address, so it cannot be sent to a refiner`
    );
  }
  if (order.order.order_sent === true && attachedRefinerId !== refiner_id) {
    throw new Conflict(
      `sales order ${order.order.number} has already been sent to a refiner. ` +
        `Sending it to a different one would leave two refiners holding it.`
    );
  }
  if (!refinerEmail) {
    throw new Invalid(
      `refiner ${refiner_id} has no email address, so sales order ` +
        `${order.order.number} cannot be sent to them`
    );
  }
}

export function assertReturnable(order: OrderView): void {
  if (!order.address) {
    throw new Invalid(
      `order ${order.order.number} has no address snapshot, so its metal cannot be returned`
    );
  }
}

export function assertRepriced(
  written: unknown, order_id: string, line_id: string
): void {
  if (!written) {
    throw new Error(
      `order ${order_id}: line ${line_id} vanished mid-write - its premium was not ` +
        `repriced and this transaction must not commit`
    );
  }
}

export function assertRemoved(removed: boolean, order_id: string, line_id: string): void {
  if (!removed) {
    throw new Error(
      `order ${order_id}: line ${line_id} was not removed - this ` +
        `transaction must not commit`
    );
  }
}

export function assertCreditable(
  amount: number | null, number: string | number | null
): asserts amount is number {
  if (amount === null) {
    throw new Invalid(`order ${number} has no total, so there is nothing to credit`);
  }
}

export function assertRefinerAttached(attached: boolean, order_id: string): void {
  if (!attached) {
    throw new Error(
      `sales order ${order_id}: the refiner was not attached - this ` +
        `transaction must not commit`
    );
  }
}

export function assertShipmentToTrack<T>(
  shipment: T | null | undefined, order_id: string
): asserts shipment is T {
  if (!shipment) throw new NotFound(`order ${order_id} has no shipment to track`);
}

export function assertCheckout<T>(
  checkout: T | null | undefined, checkout_id: string
): asserts checkout is T {
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`);
}

export function assertPlaceable(missing: CheckoutMissing[]): void {
  if (missing.length > 0) {
    throw new Invalid(`the checkout is not complete - missing ${missing.join(", ")}`);
  }
}

export function requireAddress<T>(row: T | undefined, what: string): T {
  if (!row) throw new Invalid(`the checkout's ${what} address does not exist`);
  return row;
}

export function requireFreeFulfillmentDraft<
  T extends { fulfillment: { order_id: string | null } }
>(draft: T | null): T {
  if (!draft) throw new Invalid("the checkout names a fulfillment that does not exist");
  if (draft.fulfillment.order_id) {
    throw new Conflict(
      "the checkout's fulfillment already belongs to an order - refresh and start again"
    );
  }
  return draft;
}

export function assertPlacedOrder<T>(
  order: T | null | undefined, order_id: string
): asserts order is T {
  if (!order) throw new Error(`order ${order_id} was placed and cannot be read back`);
}

export function assertEveryMetalQuoted(
  lines: Pick<OrderItem, "metal_id">[], frozen: { metal_id: string }[]
): void {
  const quoted = new Set(frozen.map((row) => row.metal_id));
  for (const metal_id of new Set(lines.map((line) => line.metal_id))) {
    if (!quoted.has(metal_id)) {
      throw new Invalid(
        `there is no live quote for metal ${metal_id}, so this order cannot be priced`
      );
    }
  }
}

export function assertEveryLineCopied(
  written: number, expected: number, order_id: string
): void {
  if (written !== expected) {
    throw new Error(
      `order ${order_id}: ${expected} basket line(s) to copy, ${written} written - ` +
        `this transaction must not commit`
    );
  }
}

export function assertTotalsWritten<T>(
  totals: T | null | undefined, order_id: string
): asserts totals is T {
  if (!totals) throw new Error(`order ${order_id}: its totals row was not written`);
}

export function assertAboveStripeMinimum(cents: number): void {
  if (belowStripeMinimum(cents)) {
    throw new Invalid("the amount left to charge is below Stripe's $0.50 minimum");
  }
}

export function assertOpenIntent<T>(intent: T | null | undefined): asserts intent is T {
  if (!intent) {
    throw new Invalid(
      "this order has a card charge and the customer has no open payment intent"
    );
  }
}

export function assertIntentLive(payment_status: string | null | undefined): void {
  if (payment_status === "canceled") {
    throw new Conflict("that payment intent was cancelled - start checkout again");
  }
}

export function assertAttachable(verdict: ReturnType<typeof attachmentVerdict>): void {
  if (verdict === "conflict") {
    throw new Conflict("that payment intent already belongs to an order");
  }
}

export function assertRepairable(
  intent: { amount: number | string | null | undefined; payment_intent_id: string },
  cents: number
): void {
  if (!repairAmountMatches(intent.amount, cents)) {
    throw new Conflict(
      `payment ${intent.payment_intent_id} was taken at a different price than this ` +
        `order totals now - contact support with that reference`
    );
  }
}

export function assertTotals<T extends Pick<OrderTotals, "total"> | null>(
  totals: T, order_id: string
): asserts totals is NonNullable<T> {
  if (!totals) throw new NotFound(`order ${order_id} has no totals`);
}
