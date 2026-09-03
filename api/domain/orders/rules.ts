// THE ORDER RULES: pure functions - named row types in, a complete row out or a domain refusal thrown (D214 item 11).
import { randomUUID } from "node:crypto";

import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { calculateItemAsk } from "#domain/pricing/ask.ts";
import { Conflict, Invalid } from "#shared/errors.ts";
import {
  DORADO_ADDRESS, DORADO_CONTACT, FEDEX_STORE_ADDRESS,
} from "#providers/shipments/constants.ts";

import type { NewOrder } from "#db/orders/repo.ts";
import type { PricedLine, NewOrderItem } from "#db/orders/items/repo.ts";
import type { NewOrderSpot } from "#db/orders/spots/repo.ts";
import type { NewOrderTotals } from "#db/orders/transactions/repo.ts";
import type { ShipmentNew } from "#db/shipping/shipments/repo.ts";
import type { CheckoutRow } from "#db/checkout/checkouts/repo.ts";
import type { OrderLine as CheckoutLine } from "#db/checkout/items/repo.ts";
import type { AddressRow } from "#db/places/addresses/repo.ts";
import type { PackageRow } from "#db/shipping/packages/repo.ts";
import type { MethodRow as PaymentMethodRow } from "#db/payments/methods/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { LabelService } from "#domain/shipping/services/service.ts";
import type { CarrierHandoff } from "#domain/shipping/handoffs/service.ts";
import type { StorefrontProduct } from "#domain/products/compose.ts";
import type { OrderPrices, Spots } from "#domain/pricing/ask.ts";
import type {
  Direction, OrderItemFromScrap, OrderItemPatch, OrderView, OrderViewProduct,
} from "@dorado/contracts";

// Type-only re-exports, erased at runtime: this file still needs no database.
export type { PricedLine } from "#db/orders/items/repo.ts";
export type { OrderLine as CheckoutLine } from "#db/checkout/items/repo.ts";
export type RateBand = NonNullable<Parameters<typeof getRatePct>[0]>[number];

// A catalogue product as a sale prices it: the storefront row, the quantity the
// cart asked for, and the rate its delivery state charges.
export type TaxedProduct = StorefrontProduct & { quantity: number; sales_tax_rate: number };

// One line of a carrier's rate quote, as the provider parses it.
export type CarrierRate = { serviceType: string | null; netCharge: number | null };

// EVERYTHING THE CARRIER IS ASKED ABOUT, resolved from rows the checkout named
// by id - so the label, the booking and the parcel row read the same values.
export type Parcel = {
  carrier_id: string; serviceType: string; carrierCode: string;
  handoff: CarrierHandoff; declaredValue: number;
  weight: { units: string; value: number };
  dimensions: { length: number; width: number; height: number; units: string };
  schedule: { date: string; time: string } | null;
};

// The ids a checkout must hold to become an order, PROVED PRESENT: an absent
// one is a refusal naming the column, never a null the pricing reads as zero.
export type PurchaseCheckout = {
  shipper_address_id: string; package_id: string; carrier_service_id: string;
  fulfillment_id: string; payment_details_id: string; package_weight: number;
};

export type SaleCheckout = { recipient_address_id: string };

// SALES TAX IS CHARGED, NOT PAID: a payout to a customer never carries it.
export function chargesSalesTax(direction: Direction): boolean {
  return direction === "sale";
}

// The order's direction, from the checkout it came from.
export function directionOf(checkout: CheckoutRow): Direction {
  return checkout.direction === "sale" ? "sale" : "purchase";
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

// ONE FROZEN QUOTE PER METAL THE ORDER CONTAINS, as COMPLETE ROWS. A metal with
// no live quote is REFUSED: a null spot prices that metal at zero.
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

// -------------------- the rows a placement writes

// The order row. The id is the caller's so every derivation below can name it
// before the row exists; the number comes from the direction's own sequence.
export function orderFrom(order_id: string, checkout: CheckoutRow, status: string): NewOrder {
  return { id: order_id, user_id: checkout.user_id, direction: directionOf(checkout), status };
}

// WHO HANDS THE ORDER OVER, from the choices the stepper left on the row: the
// draft it mutated, else the method it named, else the direction's default.
export function handoverOf(order_id: string, checkout: CheckoutRow) {
  return {
    order_id, direction: directionOf(checkout),
    fulfillment_id: checkout.fulfillment_id, method_id: checkout.fulfillment_method_id,
    pickup_address_id: checkout.pickup_address_id,
    location_id: checkout.appointment_location_id, start_time: checkout.appointment_time,
  };
}

// A line whose metal cannot be resolved is REFUSED, never skipped: an order
// silently missing a line means the customer's metal arrives unrecorded.
function metalOf(line: CheckoutLine): string {
  if (!line.metal_id) {
    throw new Invalid(
      `checkout item ${line.id} has no metal, and neither does the product it ` +
        `names - orders.items.metal_id is NOT NULL, so this order cannot be placed`
    );
  }
  return line.metal_id;
}

// THE LINES THE BUSINESS BUYS. The cart's premium is a display figure, so it is
// left out: every purchase line is tiered from rates.rates at placement.
export function linesBought(order_id: string, cart: CheckoutLine[]): NewOrderItem[] {
  return cart.map((line) => ({
    id: randomUUID(), order_id, bullion_id: line.bullion_id, metal_id: metalOf(line),
    pre_melt: line.pre_melt, post_melt: line.post_melt, purity: line.purity,
    content: line.content, quantity: line.quantity ?? 1, confirmed: false, unit: line.unit,
  }));
}

// THE LINES THE BUSINESS SELLS, priced as they are created from the server's own
// spot. A line the catalogue did not price is REFUSED - it would sell for zero.
export function linesSold(
  order_id: string, cart: CheckoutLine[], catalogue: TaxedProduct[], spots: Spots
): NewOrderItem[] {
  const soldById = new Map(catalogue.map((product) => [product.id, product]));
  return cart.map((line) => {
    const product = line.bullion_id === null ? undefined : soldById.get(line.bullion_id);
    if (!product) {
      throw new Invalid(
        `checkout item ${line.id} names no product the catalogue prices, so this ` +
          `sale cannot be placed`
      );
    }
    return {
      id: randomUUID(), order_id, bullion_id: product.id, metal_id: metalOf(line),
      pre_melt: product.gross, post_melt: product.content, purity: product.purity,
      content: product.content, quantity: line.quantity ?? 1, confirmed: true,
      premium: Number(product.ask_premium ?? 0), sales_tax_charged: product.sales_tax_rate,
      price: calculateItemAsk(product, spots), unit: "t oz",
    };
  });
}

// WHAT THE CATALOGUE IS ASKED TO PRICE: the bullion lines, by id and quantity.
export function catalogueWanted(cart: CheckoutLine[]): { id: string; quantity: number }[] {
  return cart.flatMap((line) =>
    line.bullion_id === null ? [] : [{ id: line.bullion_id, quantity: line.quantity ?? 0 }]
  );
}

// WHAT A PURCHASE COMES TO at placement: the postage the server was quoted, and
// where the customer is paid, with the method's own flat fee.
export function totalsBought(
  order_id: string, checkout: CheckoutRow, parcel: Parcel, netCharge: number, payout_fee: number
): NewOrderTotals {
  return {
    order_id, shipping: netCharge, shipping_service: parcel.serviceType,
    used_funds: false, payout_fee, payout_details_id: checkout.payment_details_id,
  };
}

// WHAT A SALE COMES TO, from the pricing service's own answer.
export function totalsSold(
  order_id: string, prices: OrderPrices, shipping_service: string | null | undefined
): NewOrderTotals {
  return {
    order_id, total: prices.order_total, shipping: prices.shipping_charge, shipping_service,
    funds: prices.pre_charges_amount, post_charges_amount: prices.post_charges_amount,
    subject_to_charges_amount: prices.subject_to_charges_amount,
    used_funds: prices.pre_charges_amount > 0, items: prices.item_total,
    base_total: prices.base_total, surcharge: prices.charges_amount,
    sales_tax: prices.sales_tax,
  };
}

// THE PARCEL ROW, written once with everything the carrier said and everything
// the checkout chose.
export function shipmentFrom(
  checkout: CheckoutRow,
  parcel: Parcel,
  postage: { netCharge: number; tracking_number: string | null; label: Buffer | null }
): ShipmentNew {
  return {
    id: randomUUID(), direction: "Inbound", tracking_number: postage.tracking_number,
    shipping_status: "Label Created", label: postage.label, label_type: "Generated",
    pickup_type: parcel.handoff.name, package_id: checkout.package_id,
    carrier_service_id: checkout.carrier_service_id, cost: postage.netCharge,
    insured: parcel.declaredValue > 0,
    declared_value: parcel.declaredValue > 0 ? parcel.declaredValue : null,
  };
}

// -------------------- the lines an admin adds

// A CATALOGUE LINE. The weights are the product's, and the premium is left for
// the re-tier to write.
export function lineFromProduct(
  order_id: string, product: OrderViewProduct
): NewOrderItem {
  return {
    order_id, bullion_id: product.id, metal_id: product.metal_id,
    pre_melt: product.gross, post_melt: product.content, purity: product.purity,
    content: product.content, quantity: 1, confirmed: false, unit: "t oz",
  };
}

// A SCRAP LINE: the scrap IS the line. Content is derived here and nowhere
// else - two definitions of what content means is the defect that costs money.
export function lineFromScrap(
  order_id: string, declared: OrderItemFromScrap
): NewOrderItem {
  return {
    order_id, metal_id: declared.metal_id, pre_melt: declared.pre_melt,
    purity: declared.purity, unit: declared.unit, quantity: 1, confirmed: false,
    content: scrapContent(declared.pre_melt, declared.unit, declared.purity),
  };
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

// -------------------- what an operation requires of the records it was given

// Names the column in the refusal, and NARROWS: the caller gets a string
// instead of a `string | null` it would have to assert away.
function required(column: string, value: string | null | undefined): string {
  if (!value) throw new Invalid(`the checkout is not complete - missing ${column}`);
  return value;
}

function assertHasItems(cart: CheckoutLine[]): void {
  if (!cart.length) throw new Invalid("a checkout with no items cannot become an order");
}

// The five ids and the weight a shipping checkout must hold to buy a label.
export function assertPlaceableAsPurchase(
  checkout: CheckoutRow, cart: CheckoutLine[]
): PurchaseCheckout {
  assertHasItems(cart);
  const package_weight = Number(checkout.package_weight);
  if (!(package_weight > 0)) throw new Invalid("the parcel needs a weight");
  return {
    shipper_address_id: required("shipper_address_id", checkout.shipper_address_id),
    package_id: required("package_id", checkout.package_id),
    carrier_service_id: required("carrier_service_id", checkout.carrier_service_id),
    fulfillment_id: required("fulfillment_id", checkout.fulfillment_id),
    payment_details_id: required("payment_details_id", checkout.payment_details_id),
    package_weight,
  };
}

// A sale is delivered, so it needs somewhere to go - and the state that address
// names is what the sales tax is charged at.
export function assertPlaceableAsSale(
  checkout: CheckoutRow, cart: CheckoutLine[]
): SaleCheckout {
  assertHasItems(cart);
  return {
    recipient_address_id: required("recipient_address_id", checkout.recipient_address_id),
  };
}

// A row the checkout names by id must actually be there.
export function requireAddress(row: AddressRow | undefined, what: string): AddressRow {
  if (!row) throw new Invalid(`the checkout's ${what} address does not exist`);
  return row;
}

// THE DRAFT THE STEPPER MUTATED, and the two things that must still be true of
// it: nobody else's order has taken it, and it is still a parcel.
export function requireFreeShipmentDraft(draft: ComposedFulfillment | null): ComposedFulfillment {
  if (!draft) throw new Invalid("the checkout names a fulfillment that does not exist");
  if (draft.order_id) {
    throw new Conflict(
      "the checkout's fulfillment already belongs to an order - refresh and start again"
    );
  }
  if (draft.method.category !== "SHIPMENT") {
    throw new Invalid(
      `a ${draft.method.category} fulfillment cannot be placed through the shipping ` +
        `checkout yet - choose a shipping handoff`
    );
  }
  return draft;
}

// WHICH HANDOFF THE CHOSEN METHOD MEANS, by CAPABILITY: the schedulable one is
// the carrier pickup. No carrier enum is spelled here.
export function handoffFor(
  handoffs: CarrierHandoff[], method_type: string | null
): CarrierHandoff {
  const handoff = handoffs.find((h) => h.requires_schedule === (method_type === "CARRIER PICKUP"));
  if (!handoff) throw new Error("the carrier's handoff catalogue is missing an option");
  return handoff;
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

// -------------------- what the carrier is asked

// Every value is the server's: the box and the service the customer chose by
// id, the weight off the row, and the insured amount already clamped (D132).
export function parcelFor(
  checkout: CheckoutRow,
  placeable: PurchaseCheckout,
  service: LabelService,
  box: PackageRow | undefined,
  handoff: CarrierHandoff,
  declaredValue: number
): Parcel {
  if (!box) throw new Invalid("the checkout names a package that does not exist");
  const { pickup_date, pickup_time } = checkout;
  const schedule =
    pickup_date && pickup_time ? { date: pickup_date, time: pickup_time } : null;
  if (handoff.requires_schedule && !schedule) {
    throw new Invalid("a carrier pickup needs a date and a time");
  }
  return {
    carrier_id: service.carrier_id, serviceType: service.serviceType,
    carrierCode: service.carrierCode, handoff, declaredValue,
    weight: { units: "LB", value: placeable.package_weight },
    dimensions: {
      length: Number(box.length), width: Number(box.width),
      height: Number(box.height), units: "IN",
    },
    schedule: handoff.requires_schedule ? schedule : null,
  };
}

// POSTAGE IS THE SERVER'S PRICE. A carrier that quoted nothing for the chosen
// service is a refusal, never a zero the business then eats.
export function quotedCharge(rates: CarrierRate[], serviceType: string): number {
  const quoted = rates.find((rate) => rate.serviceType === serviceType);
  if (quoted?.netCharge == null) {
    throw new Invalid(
      `the carrier quoted no rate for ${serviceType} - try a different service`
    );
  }
  return quoted.netCharge;
}

// A PURCHASE COMES TO THE STORE: the customer's own address ships it, and the
// business receives it.
export function rateRequest(shipper: AddressRow, parcel: Parcel) {
  return {
    shippingType: "Inbound", address: shipper, pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    declaredValue:
      parcel.declaredValue > 0 ? { amount: parcel.declaredValue, currency: "USD" } : undefined,
  };
}

export function labelRequest(shipper: AddressRow, personName: string, parcel: Parcel) {
  return {
    shipper: {
      contact: { personName, phoneNumber: shipper.phone_number ?? "" }, address: shipper,
    },
    recipient: { contact: DORADO_CONTACT, address: FEDEX_STORE_ADDRESS },
    serviceType: parcel.serviceType, pickupType: parcel.handoff.code,
    pkg: { weight: parcel.weight, dimensions: parcel.dimensions },
    insurance: { declaredValue: { amount: parcel.declaredValue, currency: "USD" } },
  };
}

// The courier comes for the label that was just bought, which is why the
// tracking number is an argument rather than a field of the parcel.
export function pickupRequest(
  shipper: AddressRow, personName: string, parcel: Parcel,
  schedule: { date: string; time: string }, trackingNumber: string | null
) {
  return {
    pickupContact: { personName, phoneNumber: shipper.phone_number ?? "" },
    pickupAddress: shipper, pickupDate: schedule.date, pickupTime: schedule.time,
    carrierCode: parcel.carrierCode, trackingNumber,
  };
}

// SENDING A CUSTOMER'S METAL BACK. Every value is the server's: the parcel goes
// to the address the ORDER snapshotted, from the business's configured one.
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

// THE PAYMENT METHOD'S OWN FLAT FEE - server money, never a client's.
export function payoutFeeOf(
  methods: PaymentMethodRow[], payment_method_id: string | null
): number {
  return Number(methods.find((m) => m.id === payment_method_id)?.flat_fee ?? 0);
}
