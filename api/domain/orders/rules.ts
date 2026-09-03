// THE ORDER RULES: pure functions, no database, no request, no provider.
//
// Each one reads like the sentence it enforces, takes NAMED ROW TYPES from the
// contracts, and either answers a value or THROWS a domain error (D214 item
// 11). A rule never returns a status code and never returns "null, sorry" for
// an input that would price an order at nothing.
//
// PURCHASE AND SALE DIFFER BY ONE COLUMN (Jacob), so `direction` is an
// ARGUMENT rather than a pair of files. Money arithmetic stays in
// domain/pricing.
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { Conflict, Invalid } from "#shared/errors.ts";
import { DORADO_ADDRESS, DORADO_CONTACT } from "#providers/shipments/constants.ts";
import type { PricedLine, NewOrderItem } from "#db/orders/items/repo.ts";
import type { NewOrderSpot } from "#db/orders/spots/repo.ts";
import type { CheckoutRow } from "#db/checkout/checkouts/repo.ts";
import type {
  OrderItemFromScrap, OrderItemPatch, OrderView, OrderViewProduct,
} from "@dorado/contracts";
import type { orders } from "@dorado/contracts";

export type Direction = NonNullable<orders.OrdersRow["direction"]>;

// A type-only import, erased at runtime: this file still needs no database.
export type { PricedLine } from "#db/orders/items/repo.ts";
export type RateBand = NonNullable<Parameters<typeof getRatePct>[0]>[number];

// SALES TAX IS CHARGED, NOT PAID: a payout to a customer never carries it.
export function chargesSalesTax(direction: Direction): boolean {
  return direction === "sale";
}

// WHICH PERCENTAGE COLUMN OF THE BAND A LINE READS. bullion_id is the one
// product reference a line carries and null means scrap (ruling 34c).
export function rateMaterialFor(line: { bullion_id?: string | null }): "scrap" | "bullion" {
  return line.bullion_id == null ? "scrap" : "bullion";
}

// Fine metal: the weight in troy ounces times the purity. NaN is "not measured"
// and must reach the database as NULL rather than as a number - D47/D65.
export function scrapContent(
  weight: number | null | undefined,
  unit: string | null | undefined,
  purity: number | null | undefined
): number | null {
  const value = convertTroyOz(weight as number, unit as string) * (purity as number);
  return Number.isFinite(value) ? value : null;
}

// WHAT A LINE CONTRIBUTES TO THE METAL TOTAL THE TIER IS READ AT. A scrap
// line's `content` already describes the whole lot, so quantity must NOT
// multiply it; a bullion line's is PER UNIT, so ten one-ounce coins are ten
// ounces of gold. That is the same asymmetry every sum in domain/pricing keeps.
export function lineContent(line: Pick<PricedLine, "content" | "quantity" | "bullion_id">): number {
  const content = Number(line.content) || 0;
  if (line.bullion_id == null) return content;
  const quantity = Number(line.quantity ?? 1);
  return content * (Number.isFinite(quantity) ? quantity : 1);
}

// EVERY LINE OF A PURCHASE PRICES FROM rates.rates (Jacob, 2026-09-03), tiered
// by the order's TOTAL content of that metal: a scrap line takes the band's
// scrap_pct and a bullion line its bullion_pct. The PRODUCT'S bid_premium plays
// NO PART in what a purchase pays - it is a catalogue figure, not a price fact.
//
// No rate bands means NO PLAN: an order placed with rates unconfigured keeps
// what it was given rather than being repriced to nothing.
export function retierPlan(
  rates: RateBand[] | null | undefined, lines: PricedLine[]
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

// ONE FROZEN QUOTE PER METAL THE ORDER CONTAINS, as COMPLETE ROWS the caller
// hands straight to createMany. A spot for a metal nobody sold is a row that
// means nothing.
//
// A METAL WITH NO LIVE QUOTE IS REFUSED, not frozen at null. Every money figure
// on the order is content * (spot * premium), so a null spot prices the metal
// at zero - and the old version wrote exactly that, silently, for any metal the
// feed had not quoted.
export function spotsToFreeze(
  order_id: string,
  lines: { metal_id: string }[],
  live: { id: string; ask: number | null; bid: number | null }[]
): NewOrderSpot[] {
  const liveByMetal = new Map(live.map((quote) => [quote.id, quote]));
  const metals = new Set(lines.map((line) => line.metal_id));

  const frozen: NewOrderSpot[] = [];
  for (const metal_id of metals) {
    const quote = liveByMetal.get(metal_id);
    if (!quote) {
      throw new Invalid(
        `there is no live quote for metal ${metal_id}, so this order cannot be priced`
      );
    }
    frozen.push({ order_id, metal_id, ask: quote.ask, bid: quote.bid });
  }
  return frozen;
}

// ===========================================================================
// THE LINES A CHECKOUT AND AN ADMIN ADD
// ===========================================================================

// A CATALOGUE LINE. The weights are the product's, and the premium is left for
// the re-tier to write: a purchase bullion line prices from the rate band's
// bullion_pct, not from the catalogue's bid_premium.
export function lineFromProduct(
  order_id: string, product: OrderViewProduct
): NewOrderItem {
  return {
    order_id,
    bullion_id: product.id,
    metal_id: product.metal_id,
    pre_melt: product.gross,
    post_melt: product.content,
    purity: product.purity,
    content: product.content,
    quantity: 1,
    confirmed: false,
    unit: "t oz",
  };
}

// A SCRAP LINE: the scrap IS the line. Content is derived here and nowhere
// else - two definitions of what content means is the defect that costs money.
export function lineFromScrap(
  order_id: string, declared: OrderItemFromScrap
): NewOrderItem {
  return {
    order_id,
    metal_id: declared.metal_id,
    pre_melt: declared.pre_melt,
    purity: declared.purity,
    unit: declared.unit,
    content: scrapContent(declared.pre_melt, declared.unit, declared.purity),
    quantity: 1,
    confirmed: false,
  };
}

// WHETHER A LINE EDIT RE-TIERS THE ORDER.
//
// A weight, a purity, a unit or a quantity moves the order's TOTAL content of
// that metal, and the band is read at that total - so every line reprices.
// A PREMIUM IN THE SAME DOCUMENT IS THE ADMIN'S OWN, and it is the one thing
// the tier must not overwrite: re-tiering after an override would answer 200
// having thrown the override away.
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

// ===========================================================================
// WHAT AN OPERATION REQUIRES OF THE RECORDS IT WAS GIVEN
// ===========================================================================

// The five ids a shipping checkout must hold before it can become an order.
// Named rather than counted, so the refusal says which one is missing.
export function assertShippingCheckoutComplete(checkout: CheckoutRow): void {
  const missing = (
    [
      ["shipper_address_id", checkout.shipper_address_id],
      ["package_id", checkout.package_id],
      ["carrier_service_id", checkout.carrier_service_id],
      ["fulfillment_id", checkout.fulfillment_id],
      ["payment_details_id", checkout.payment_details_id],
    ] as const
  ).flatMap(([name, value]) => (value ? [] : [name]));

  if (missing.length) {
    throw new Invalid(`the checkout is not complete - missing ${missing.join(", ")}`);
  }
  if (!(Number(checkout.package_weight) > 0)) {
    throw new Invalid("the parcel needs a weight");
  }
}

// A carrier pickup is a booking, and a booking needs a time.
export function assertPickupScheduled(checkout: CheckoutRow): void {
  if (!checkout.pickup_date || !checkout.pickup_time) {
    throw new Invalid("a carrier pickup needs a date and a time");
  }
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

// AN ORDER MAY BE RE-SENT TO THE SAME REFINER and never MOVED to another: two
// refiners would each hold it. An order with no address cannot be sent at all -
// the message exists to say where to ship the metal, and production holds a
// sales order with no address. A refiner with no email cannot be told, and
// production holds one of those too.
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

// ===========================================================================
// THE RETURN LABEL
// ===========================================================================

// THE CARRIER REQUEST FOR SENDING A CUSTOMER'S METAL BACK. It used to be built
// from the admin drawer's own form object, typed `Record<string, any>` and
// hand-mapped field by field. Every value here is the server's: the parcel goes
// to the address the ORDER snapshotted, from the business's configured address,
// in the box and by the service the admin chose by id.
export function returnLabelRequest(
  order: OrderView,
  { serviceType, weight, dimensions, declaredValue }: {
    serviceType: string;
    weight: { units: string; value: number };
    dimensions: { length: number; width: number; height: number; units: string };
    declaredValue: number;
  }
) {
  if (!order.address) {
    throw new Invalid(
      `order ${order.order.number} has no address snapshot, so its metal cannot be returned`
    );
  }
  return {
    shipper: { contact: DORADO_CONTACT, address: DORADO_ADDRESS },
    recipient: {
      contact: {
        personName: order.user?.name ?? "",
        phoneNumber: order.address.phone_number ?? "",
      },
      address: order.address,
    },
    serviceType,
    pkg: { weight, dimensions },
    insurance: { declaredValue: { amount: declaredValue, currency: "USD" } },
  };
}

// ===========================================================================
// PAYMENT FACTS (D211 - statuses are flair; every decision is a payment fact)
// ===========================================================================

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

// What an already-attached intent means for a new order. The intent is reused
// until it settles, so an abandoned checkout comes back still holding one.
//
//   conflict   it paid for something, or belongs to a purchase - a SETTLED
//              intent stays with the order it paid for, whatever label it wears
//   supersede  an unsettled sale paid for nothing: cancel, detach, proceed
//   proceed    nothing is attached
export type IntentFacts = {
  sales_order_id?: string | null;
  purchase_order_id?: string | null;
  payment_status?: string | null;
};

export function attachmentVerdict(
  intent: IntentFacts
): "proceed" | "supersede" | "conflict" {
  if (intent.purchase_order_id) return "conflict";
  if (!intent.sales_order_id) return "proceed";
  return isSettled(intent.payment_status) ? "conflict" : "supersede";
}

// A repair is honoured only at the price actually taken: if spot has moved since
// the charge, refuse rather than guess.
export function repairAmountMatches(
  intent_amount: number | string | null | undefined, cents: number
): boolean {
  return Number(intent_amount) === cents;
}
