// THE ORDER RULES: a short list of NAMED DECISIONS (ruling 66, Jacob: "I also
// hate all those returns. I thought this was supposed to be made way simpler
// to understand??").
//
// Two kinds of thing left, and nothing else:
//
//   DECISIONS  what premium a line earns, what a sale line is priced from,
//              what a screen may offer, what a payment fact means
//   REFUSALS   one named assert per thing a use case can refuse, called as a
//              single line from the use case (ruling 65)
//
// WHAT LEFT, AND WHERE IT WENT. Every function that only COPIED fields into a
// row literal - orderFrom, handoverOf, linesBought, linesSold, totalsBought,
// totalsSold, shipmentFrom, lineFromProduct, lineFromScrap - is an
// `INSERT … SELECT` now, in db/orders/sql/ (ruling 66): the columns share
// names, so the statement copies and no rule restates the table. Every CARRIER
// fact - Parcel, parcelFor, rebuyParcel, quotedCharge, handoffFor,
// scheduleFromPickup and the four request builders - went to shipping and its
// provider (ruling 67, Jacob: "I don't understand why any carrier or shipping
// stuff is living in orders").
//
// EVERY TYPE IT DECLARED WENT TO @dorado/contracts (rulings 57/60/61): the row
// is `Order`, a line is `OrderItem`, a sale line is `SaleLine`, a parcel is
// `Parcel`. Nothing here declares one.
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
// Fine metal has ONE definition and it lives in pricing - see content.ts.
import { fineContent } from "#domain/pricing/content.ts";
import { Conflict, Invalid, NotFound } from "#shared/errors.ts";

import type {
  BullionStorefront, CheckoutStep, Direction, OrderActions, OrderItem, OrderItemPatch,
  OrderLine, OrderTotals, OrderView, PaymentIntentFacts, PaymentMethod, PricedLine,
  SaleLine, TaxedSaleLine,
} from "@dorado/contracts";

// -------------------- what a line is worth, and to whom

// SALES TAX IS CHARGED, NOT PAID: a payout to a customer never carries it.
export function chargesSalesTax(direction: Direction): boolean {
  return direction === "sale";
}

// The order's direction, from the checkout it came from.
export function directionOf(checkout: { direction: string }): Direction {
  return checkout.direction === "sale" ? "sale" : "purchase";
}

// WHICH PERCENTAGE COLUMN OF THE BAND A LINE READS. bullion_id is the one
// product reference a line carries and null means scrap (ruling 34c).
export function rateMaterialFor(line: { bullion_id?: string | null }): "scrap" | "bullion" {
  return line.bullion_id == null ? "scrap" : "bullion";
}

// WHAT A LINE CONTRIBUTES TO THE METAL TOTAL THE TIER IS READ AT. A scrap line's
// `content` is the whole lot; a bullion line's is PER UNIT, so quantity counts.
export function lineContent(line: Pick<PricedLine, "content" | "quantity" | "bullion_id">): number {
  const content = Number(line.content) || 0;
  if (line.bullion_id == null) return content;
  const quantity = Number(line.quantity ?? 1);
  return content * (Number.isFinite(quantity) ? quantity : 1);
}

// EVERY LINE OF A PURCHASE PRICES FROM rates.rates (Jacob, 2026-09-03), tiered by
// the order's TOTAL content of that metal. No bands means NO PLAN.
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

// -------------------- what a sale is priced from

// ONE SALE LINE PER CART LINE, priced from the ITEM: the product supplies only
// the ask premium and the three product facts a tax rule matches on.
// `metals` is metal id -> name; the ask is looked up under the ITEM's metal.
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
    // Refused, not priced at zero: a pre-snapshot basket has no content.
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

// Each product once. Quantity is zero because the LINE carries it.
export function catalogueWanted(cart: OrderLine[]): { id: string; quantity: number }[] {
  const ids = new Set(
    cart.flatMap((line) => (line.bullion_id === null ? [] : [line.bullion_id]))
  );
  return [...ids].map((id) => ({ id, quantity: 0 }));
}

// THE THREE FIGURES THE SALE PRICING DECIDED, KEYED BY THE BASKET LINE they
// belong to - what db/orders/items/sql/create_sold.sql joins its copy against.
// Paired to `priced` BY POSITION, which is what saleLines guarantees: one
// entry per cart line, in the cart's own order.
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

// -------------------- the lines an admin adds and edits

// A DECLARED LOT: the scrap IS the line. Content is derived here and nowhere
// else - two definitions of what content means is the defect that costs money.
export function declaredLot(declared: OrderItemPatch): OrderItemPatch & { metal_id: string } {
  assertDeclaredMetal(declared.metal_id);
  return Object.assign({}, declared, {
    metal_id: declared.metal_id,
    quantity: 1,
    confirmed: false,
    content: fineContent(declared.pre_melt, declared.unit, declared.purity),
  });
}

// WHETHER A LINE EDIT RE-TIERS THE ORDER: a weight, purity, unit or quantity
// moves the metal total the band is read at. A PREMIUM IS THE ADMIN'S OWN.
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

// -------------------- payment facts (d211 - statuses are flair; every decision is a payment fact)

// SETTLED MEANS THE MONEY IS COMMITTED. `processing` counts: the funds are on
// their way, so the intent is no longer free to move to another order.
export function isSettled(payment_status: string | null | undefined): boolean {
  return payment_status === "succeeded" || payment_status === "processing";
}

export function chargeCents(post_charges_amount: number): number {
  return Math.round(post_charges_amount * 100);
}

// Stripe's floor is $0.50, and pricing caps applied credit so a card remainder
// is either 0 or at least that.
export const STRIPE_MINIMUM_CENTS = 50;

export function belowStripeMinimum(cents: number): boolean {
  return cents > 0 && cents < STRIPE_MINIMUM_CENTS;
}

// THE LABEL DERIVES FROM A MONEY FACT, not the method's name: nothing left to
// charge means nothing to await. Pending means AWAITING PAYMENT.
export function statusAtPlacement(cents: number, alreadySucceeded: boolean): string {
  return cents > 0 && !alreadySucceeded ? "Pending" : "Preparing";
}

// What an already-attached intent means for a new order: conflict (it paid for
// something), supersede (an unsettled sale paid for nothing), proceed (free).
export function attachmentVerdict(
  intent: Partial<Pick<PaymentIntentFacts, "order_id" | "direction" | "payment_status">>
): "proceed" | "supersede" | "conflict" {
  if (!intent.order_id) return "proceed";
  if (intent.direction === "purchase") return "conflict";
  return isSettled(intent.payment_status) ? "conflict" : "supersede";
}

// A repair is honoured only at the price actually taken: if spot has moved since
// the charge, refuse rather than guess.
export function repairAmountMatches(
  intent_amount: number | string | null | undefined, cents: number
): boolean {
  return Number(intent_amount) === cents;
}

// THE PAYMENT METHOD'S OWN FLAT FEE - server money, never a client's.
export function payoutFeeOf(
  methods: PaymentMethod[], payment_method_id: string | null
): number {
  return Number(methods.find((m) => m.id === payment_method_id)?.flat_fee ?? 0);
}

// -------------------- what a screen may offer (the drawer switch, moved)

// THE LINE'S TWO DERIVED FIGURES. `payable` is the fine ounces the business
// pays for; `line_total` is what the line comes to - the whole lot for scrap,
// per unit for bullion, which is the definition the purchase footer and the
// sale footer had drifted apart on.
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

// THE STATUS LADDERS, one per direction. A status is a pure customer-facing
// label (ruling 2) and this list says which are OFFERED next, never what any
// of them does. Two rungs are GATED, and both gates were `disabled:` props in
// an admin drawer: a purchase reaches 'Payment Processing' only once every
// line is confirmed, and a sale reaches 'In Transit' only once the refiner has
// it and it carries a tracking number.
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

// EVERY LINE CONFIRMED, and an order with NO lines is not confirmed: an empty
// order priced at nothing is the one case the drawer's `items.every(...)`
// answered `true` for.
export function allLinesConfirmed(items: { confirmed: boolean }[]): boolean {
  return items.length > 0 && items.every((item) => item.confirmed === true);
}

// A CUSTOMER'S CREDIT BALANCE IS ONE PAYOUT METHOD AMONG SEVERAL. Crediting an
// order the business is about to pay by ACH would pay it twice, which is why
// this asks the payout row rather than the status.
export function creditsToAccount(payoutMethod: string | null): boolean {
  return payoutMethod === "DORADO_ACCOUNT";
}

// THE FACTS BOTH ANSWERS ARE READ FROM: the order's own row, the rows the view
// already holds, and the payout's method. Named once here because it is one
// call's argument shape and never something a table stores.
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

// WHICH OF THE ORDER'S ENDPOINTS THIS ORDER CAN ACTUALLY ANSWER. Each mirrors
// the refusal the use case throws, so a button that is offered is a call that
// is accepted - and a screen holds none of it.
export function actionsFor(facts: Facts): OrderActions {
  const purchase = facts.direction === "purchase";
  const sale = facts.direction === "sale";
  const inbound = facts.shipments.find((s) => s.direction === "Inbound");
  return {
    cancel: purchase && facts.hasAddress,
    finalize_pricing: purchase && allLinesConfirmed(facts.items),
    add_funds: purchase && facts.hasTotal && creditsToAccount(facts.payoutMethod),
    // A resend to the SAME refiner is allowed; a different one is refused by
    // assertSendable, which is a conflict rather than an availability rule.
    send_to_refiner: sale && facts.hasAddress,
    // ANSWERED FROM THE SHIPMENT'S OWN STATE (ruling 67): the parcel exists and
    // carries no label, so POST /api/shipments/:id/label will accept.
    buy_label: purchase && !!inbound && !inbound.tracking_number,
    update_tracking: facts.shipments.length > 0,
    edit_lines: purchase,
    statuses: statusesFor(facts),
  };
}

// -------------------- the refusals an order's use cases make (ruling 65)
//
// Every refusal this feature can make, named for what it protects, called as
// one line from the use case. The KIND is the answer - NotFound for "that does
// not exist", Conflict for "the current state forbids this", Invalid for "the
// business does not allow this" - and a plain Error for a FAULT, which is a
// write that did not land where nothing about the request explains why.

// An all-optional schema cannot say "name at least one field", so the RULE
// says it: an empty document is a write that would change nothing and report
// success.
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

// The spots PUT is two optional fields - `lock` pins the order at today's feed
// and `set` adjusts a named metal's bid - so "names a field" is a question
// about both rather than about the key count.
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

// orders.items.metal_id is NOT NULL and a declared lot names its own metal:
// the alternative to refusing is a 23502 that says nothing about the form.
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

// AN ORDER MAY BE RE-SENT TO THE SAME REFINER and never MOVED to another. It
// needs an address to be sent and a refiner needs an email to be told.
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

// SENDING A CUSTOMER'S METAL BACK NEEDS SOMEWHERE TO SEND IT, and the answer
// is the ORDER's own snapshot - never the book entry it was copied from.
// Refused HERE, before anything is written, rather than by shipping when it
// goes looking: a cancellation that commits a Return shell it can never label
// is a parcel row nobody can act on. `OrderView.actions.cancel` mirrors it.
export function assertReturnable(order: OrderView): void {
  if (!order.address) {
    throw new Invalid(
      `order ${order.order.number} has no address snapshot, so its metal cannot be returned`
    );
  }
}

// A FAULT, not a refusal. Re-tiering reads the lines and then writes each one
// back inside the same transaction, so a line that is no longer there is a row
// deleted underneath an open transaction - and a zero-row UPDATE does not
// raise (audit:silent-mutations), so the only alternative is committing an
// order whose premiums are half repriced.
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

// The same fault on the way out: the line was read a statement ago.
export function assertRemoved(removed: boolean, order_id: string, line_id: string): void {
  if (!removed) {
    throw new Error(
      `order ${order_id}: line ${line_id} was not removed - this ` +
        `transaction must not commit`
    );
  }
}

// THE LEDGER MUST RECORD WHAT WAS ACTUALLY CREDITED, so an order with no total
// credits nothing rather than crediting zero and logging it as a payment.
export function assertCreditable(
  amount: number | null, number: string | number | null
): asserts amount is number {
  if (amount === null) {
    throw new Invalid(`order ${number} has no total, so there is nothing to credit`);
  }
}

// A FAULT: the engagement id was resolved one statement earlier in the same
// transaction, and metal is about to be emailed to a refinery against it.
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

// -------------------- the refusals a placement makes

export function assertCheckout<T>(
  checkout: T | null | undefined, checkout_id: string
): asserts checkout is T {
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`);
}

// THE ONE READINESS ASSERT (rulings 64/66). `missing` is the checkout's own
// answer to "what has the customer not chosen yet", ordered the way the
// stepper walks it, and it follows the chosen method's CATEGORY - so a pickup
// is never refused for having no box. Placement states the refusal once
// instead of re-listing five ids per direction.
export function assertPlaceable(missing: CheckoutStep[]): void {
  if (missing.length > 0) {
    throw new Invalid(`the checkout is not complete - missing ${missing.join(", ")}`);
  }
}

// A row the checkout names by id must actually be there.
export function requireAddress<T>(row: T | undefined, what: string): T {
  if (!row) throw new Invalid(`the checkout's ${what} address does not exist`);
  return row;
}

// THE DRAFT THE STEPPER MUTATED, and the one thing that must still be true of
// it: nobody else's order has taken it. THE CATEGORY REFUSAL IS GONE - a
// placement accepts all three (Jacob, 2026-09-04), so a DIRECT or PICKUP draft
// is attached like any other and simply buys no label.
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

// A FAULT: the order committed a statement ago and cannot be read back.
export function assertPlacedOrder<T>(
  order: T | null | undefined, order_id: string
): asserts order is T {
  if (!order) throw new Error(`order ${order_id} was placed and cannot be read back`);
}

// EVERY METAL THE ORDER HOLDS MUST HAVE A LIVE QUOTE. The freeze is an
// `INSERT … SELECT` off spots.spots, so a metal the feed has no row for simply
// does not join - a SHORT answer, which is what this reads. A null spot prices
// that metal at zero, so it is refused rather than accepted.
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

// A FAULT: the copy ran a statement ago in this transaction. A short answer
// means a basket line did not survive the `INSERT … SELECT`, which would commit
// an order missing metal the customer is about to post.
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

// A FAULT of the same shape, one statement later.
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

// A settled, unattached intent is D179 wreckage arriving to be repaired: the
// money is real, so the order is born paid IF the amount still matches. When
// it does not, a human has to look at it - the customer has been charged.
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

// The order's own totals row, which finalize-pricing and add-funds both read.
export function assertTotals<T extends Pick<OrderTotals, "total"> | null>(
  totals: T, order_id: string
): asserts totals is NonNullable<T> {
  if (!totals) throw new NotFound(`order ${order_id} has no totals`);
}
