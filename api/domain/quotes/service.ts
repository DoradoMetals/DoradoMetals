// The quote surface: every number a customer sees, priced by the server on
// request. Four reads, the pricing halves of flows that already exist:
//
//   catalog        -> the storefront's price on a product, either side
//   sales_order    -> placement's pricing path, without the insert
//   purchase_order -> intake's premium resolution over sell-cart lines
//   order          -> what an EXISTING purchase order is worth right now
//
// THE PRICE OF METAL COMES ONLY FROM THE SERVER. Bodies carry ids, quantities
// and declared weights - never a premium, a spot or a content. A spoofed
// ask_spot once priced a $3,673.53 order at $26.81; a replay test pins it.
// NOTHING HERE WRITES: a quote is an answer, not a hold.
import * as productService from "#domain/products/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as ratesService from "#domain/rates/service.ts";
import * as servicesService from "#domain/shipping/services/service.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as methodsRepo from "#db/payments/methods/repo.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";
import * as usersService from "#domain/users/service.ts";
import { payoutFee, PAYOUT_METHOD_FEES } from "#domain/payouts/constants.ts";
import {
  bandableContent, bidPrice, declaredContent, estimatedPayout,
  requireBandPremium, requireSpot,
} from "#domain/quotes/rules.ts";
import { calculateItemAsk, calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import { effectivePayoutFee, inboundShipment } from "#domain/pricing/service.ts";
import { sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import type {
  CatalogQuote, CatalogQuoteBody, OrderQuote, OrderQuoteBody, OrderQuoteLine,
  PurchaseOrderQuote, PurchaseOrderQuoteBody, PurchaseOrderQuoteLine,
  SalesOrderQuote, SalesOrderQuoteBody,
} from "@dorado/contracts";

export type {
  CatalogQuote, OrderQuote, PurchaseOrderQuote, SalesOrderQuote,
} from "@dorado/contracts";

// The same gate checkout applies to a cart, applied to a quote: an ASK quote
// may only name a product live on the buy side (`display`). A BID quote has
// no gate (Jacob, 2026-09-03, ruling 49) - it checks only that the id names a
// product at all. An unknown id is refused the same as a hidden one, so the
// message cannot confirm which ids exist.
async function refuseProductsThatAreNotLive(
  ids: string[], side: "ask" | "bid"
): Promise<void> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return;

  const rows = await productService.getLiveness(unique);
  const live = new Set(
    side === "ask"
      ? rows.filter((r) => r.display === true).map((r) => r.id)
      : rows.map((r) => r.id)
  );
  const refused = unique.filter((id) => !live.has(id));

  if (refused.length > 0) {
    throw new Invalid(
      refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`
    );
  }
}

// ------------------------------------------------------------------ catalog

// The catalogue, priced. PUBLIC (mirrors /spots/spot_prices): the storefront
// quotes anyone who visits, and this returns nothing a visitor cannot derive
// from the public product list and spot feed.
// quantity defaults to 1 - what does ONE cost.
export async function catalogQuote({ side, items }: CatalogQuoteBody): Promise<CatalogQuote> {
  await refuseProductsThatAreNotLive(items.map((line) => line.id), side);

  // Sequential, not Promise.all: neither call takes a client of its own, so
  // both default to the shared pool - genuinely concurrent when unpinned,
  // but the same client under a pinned test transaction. See
  // domain/products/compose.ts's labels() for the fuller version of this
  // note.
  const rows = await productService.getItemsFromServer(
    items.map((line) => ({ id: line.id, quantity: line.quantity ?? 1 }))
  );
  const spots = await spotsService.getSpotPrices();
  const spots_at = new Date().toISOString();
  const byId = new Map(rows.map((row) => [row.id, row]));

  const quoted = items.map(({ id, quantity = 1 }) => {
    // The liveness gate proved the id exists; a row can still drop out if its
    // metal or mint no longer resolves - refused rather than understated.
    const row = byId.get(id);
    if (!row) throw new Invalid("That product is not available");
    const unit_price = side === "ask"
      ? calculateItemAsk(row, spots)
      : bidPrice(row.content, row.bid_premium, row.metal_type, spots);
    return { id, quantity, unit_price, line_total: unit_price * quantity };
  });

  return {
    side, spots_at, items: quoted,
    total: quoted.reduce((acc, line) => acc + line.line_total, 0),
  };
}

// -------------------------------------------------------------- sales order

// Placement's pricing path with the insert removed - the same functions in the
// same order, so a quote and the order it becomes cannot disagree except by
// spot movement between them.
//
// The address is OPTIONAL, which placement's is not: a quote is asked before
// one is chosen, and absent means taxed in no state.
export async function salesOrderQuote(
  subject_user_id: string,
  { items, address_id, carrier_service_id, payment_method_id }: SalesOrderQuoteBody
): Promise<SalesOrderQuote> {
  // THE BALANCE IS THE SUBJECT'S OWN ROW, read fresh rather than taken from the
  // session's cached copy, because that is the balance an order placed after
  // this quote would actually apply. A caller declaring their own balance would
  // be declaring their own discount.
  const balance = await usersService.getBalance(subject_user_id);
  if (balance === undefined) throw new Forbidden("no user row for this session");
  const dorado_funds = balance == null ? 0 : Number(balance);

  const address = address_id ? await addressService.getAddressFromId(address_id) : undefined;
  if (address_id && !address) throw new NotFound(`no address ${address_id}`);

  const service = carrier_service_id
    ? await servicesRepo.getOne(carrier_service_id) : undefined;
  const method = payment_method_id
    ? await methodsRepo.getOne(payment_method_id) : undefined;

  const serverItems = await productService.getItemsFromServer(
    items.map((line) => ({ id: line.id, quantity: line.quantity ?? 0 }))
  );
  const spots = await spotsService.getSpotPrices();
  const spots_at = new Date().toISOString();
  const withTax = await taxService.attachSalesTaxToItems(
    address?.state ?? null, serverItems, spots
  );

  // Credit applies whenever the customer has a balance - placement's own rule,
  // so the quote and the order price identically.
  const prices = calculateSalesOrderTotal(
    withTax, spots, { dorado_funds }, service?.code, method?.type
  );

  const lines = withTax.map((item) => {
    const unit_ask = calculateItemAsk(item, spots);
    // quantity ?? 1, matching calculateItemTotals - a line the breakdown counts
    // once must not read as zero here.
    const quantity = Number(item.quantity ?? 1);
    return {
      id: item.id, quantity, unit_ask,
      line_total: unit_ask * quantity,
      sales_tax_rate: item.sales_tax_rate,
    };
  });

  return {
    spots_at,
    item_total: prices.item_total,
    base_total: prices.base_total,
    shipping_charge: prices.shipping_charge,
    beginning_funds: prices.beginning_funds,
    ending_funds: prices.ending_funds,
    pre_charges_amount: prices.pre_charges_amount,
    subject_to_charges_amount: prices.subject_to_charges_amount,
    post_charges_amount: prices.post_charges_amount,
    charges_amount: prices.charges_amount,
    sales_tax: prices.sales_tax,
    order_total: prices.order_total,
    items: lines,
  };
}

// ----------------------------------------------------------- purchase order

// What a line is, once the ids in the body have been resolved to rows. An
// internal computation shape: it exists between the load and the pricing and
// never crosses a boundary.
type PricedPurchaseLine = {
  index: number;
  kind: "product" | "scrap";
  metal: string;
  content: number;
  quantity: number;
};

// The sell cart, priced the way placement prices a purchase: the premium comes
// ONLY from the rate band for the metal, chosen on that metal's TOTAL content
// across the whole quote (two 5oz gold lines price as a 10oz order).
//
// Returns the PAYOUT, not just the goods total. The browser used to compute
// `quote.total - (shippingCost ?? 0 + paymentCost)` - `+` binds tighter than
// `??`, so one of the two deductions was always silently discarded and the
// headline read $20 high on a WIRE payout while the rows beneath it disagreed.
// The fix is not the parenthesis: the server returns the figure, and the same
// subtraction orderQuote does for a SAVED order.
export async function purchaseOrderQuote(
  { items, payout_method_id, shipping_charge }: PurchaseOrderQuoteBody
): Promise<PurchaseOrderQuote> {
  // Both deductions are OPTIONAL: the review step quotes before a service or a
  // payout method is chosen, and a goods-only quote is a real answer.
  const payout_charge = await payoutChargeFor(payout_method_id);
  const carriage = shipping_charge ?? 0;

  const productIds = items.flatMap(
    (line) => (line.type === "product" ? [line.bullion_id] : [])
  );
  await refuseProductsThatAreNotLive(productIds, "bid");

  // Sequential - see catalogQuote's note above; three calls with no client of
  // their own is the same shared-pool fan-out.
  // quantity 0 because only the row is wanted: each line below keeps its own
  // quantity, so duplicate ids cannot collapse into one.
  const rows = await productService.getItemsFromServer(
    Array.from(new Set(productIds)).map((id) => ({ id, quantity: 0 }))
  );
  const spots = await spotsService.getSpotPrices();
  const rates = await ratesService.getAllRates();
  const spots_at = new Date().toISOString();
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Metal and content are resolved server-side: a product's from its own row, a
  // scrap line's from the declared weight, purity and unit.
  const lines: PricedPurchaseLine[] = items.map((line, index) => {
    if (line.type === "product") {
      const row = byId.get(line.bullion_id);
      if (!row) throw new Invalid("That product is not available");
      return {
        index, kind: "product", metal: row.metal_type,
        content: Number(row.content ?? 0), quantity: line.quantity ?? 1,
      };
    }
    return {
      index, kind: "scrap", metal: requireSpot(spots, line.metal_id).name,
      content: declaredContent(line.pre_melt, line.purity, line.unit), quantity: 1,
    };
  });

  const contentByMetal = sumContentByMetal(
    lines, (line) => line.metal, (line) => bandableContent(line.kind, line.content, line.quantity)
  );

  const quoted: PurchaseOrderQuoteLine[] = lines.map((line) => {
    const premium = requireBandPremium(
      rates, line.metal, contentByMetal[line.metal.trim().toLowerCase()] ?? 0, line.kind
    );
    const unit_price = bidPrice(line.content, premium, line.metal, spots);
    return {
      index: line.index, kind: line.kind, metal: line.metal, content: line.content, premium,
      unit_price,
      // Scrap is not multiplied by quantity: its content already describes the
      // whole line, which is how calculateTotalPrice sums it.
      line_total: line.kind === "product" ? unit_price * line.quantity : unit_price,
    };
  });

  const total = quoted.reduce((acc, line) => acc + line.line_total, 0);

  // Declared value is the total, capped by what we will insure. It was a bare
  // total with the cap applied in the browser as a hardcoded Math.min(total,
  // 50000) - FedEx's ceiling, deciding parcel coverage from a literal in React.
  // Service-agnostic by necessity: a quote is priced before a service is
  // chosen, so this uses the LOWEST ceiling among those offered and the label
  // path narrows to the chosen one, which can only lower it further.
  const declared_value = Math.min(total, await servicesService.insuranceCeiling());

  return {
    spots_at, items: quoted, total, declared_value,
    shipping_charge: carriage, payout_charge,
    estimated_payout: estimatedPayout(total, carriage, payout_charge),
  };
}

// The fee the named payout method costs the customer. Resolved from the
// method's own row and then from payouts/constants.ts, which owns the table:
// a stored payout's fee is read from its own row and never re-derived here
// (D117), so this is the default a NEW order quotes at.
async function payoutChargeFor(payout_method_id: string | null | undefined): Promise<number> {
  if (!payout_method_id) return 0;
  const method = await methodsRepo.getOne(payout_method_id);
  const fee = method ? payoutFee(method.type) : null;
  if (fee === null) {
    throw new Invalid(
      `that is not a payout method - expected one of ${Object.keys(PAYOUT_METHOD_FEES).join(", ")}`
    );
  }
  return fee;
}

// --------------------------------------------------------- existing order

// An EXISTING purchase order, priced - the drawer's client-side estimate,
// server-side. Loaded through the same read the drawer's own GET uses, so items
// and premiums match exactly. requireOwnOrder has already checked ownership.
//
// Per metal: the order's own frozen bid when set, else the live spot - which is
// how finalizePricing distinguishes locked from unlocked (a non-null frozen bid
// IS the locked state).
//
// A metal with no spot anywhere prices at 0 rather than throwing: this is a
// drawer estimate for an order that already exists and must render. The accept
// path keeps calculateTotalPrice's throw.
export async function orderQuote({ order_id }: OrderQuoteBody): Promise<OrderQuote> {
  const order = await orderRead.view(order_id);
  // requireOwnOrder answers 403 for a customer naming an order that is not
  // theirs or does not exist; only an admin reaches this.
  if (!order) throw new NotFound("no such purchase order");

  // Sequential - see catalogQuote's note above.
  const liveSpots = await spotsService.getSpotPrices();
  const frozenSpots = await orderSpotsService.rowsFor(order_id);
  const spots_at = new Date().toISOString();

  // KEYED BY METAL ID, where this used to match on the metal's display NAME. A
  // line names its metal by id and always has; the name was a join the composed
  // order carried.
  const frozenBidByMetal = new Map(frozenSpots.map((spot) => [spot.metal_id, spot.bid]));
  const liveBidByMetal = new Map(liveSpots.map((spot) => [spot.id, spot.bid]));
  const bidFor = (metal_id: string): number => {
    const frozen = frozenBidByMetal.get(metal_id);
    if (frozen != null) return Number(frozen);
    return Number(liveBidByMetal.get(metal_id) ?? 0);
  };

  const items: OrderQuoteLine[] = [];
  let scrap_total = 0;
  let bullion_total = 0;

  for (const item of order.items) {
    const stored = item.price != null;

    if (item.bullion_id !== null) {
      // NO CATALOGUE FALLBACK. A purchase pays the rate tier, and item.premium
      // is the tier this line was priced at; the product's own bid_premium is
      // a number the placed order does not pay.
      const premium = Number(item.premium ?? 0);
      const unit_price = stored
        ? Number(item.price)
        : Number(item.content ?? item.product?.content ?? 0) *
          (bidFor(item.metal_id) * premium);
      // A stored price is PER UNIT: every consumer multiplies by quantity.
      const line_total = unit_price * Number(item.quantity ?? 1);
      bullion_total += line_total;
      items.push({
        id: item.id, kind: "product", source: stored ? "stored" : "estimate",
        premium, unit_price, line_total,
      });
      continue;
    }

    // A scrap line's content covers the whole lot, so quantity does not
    // multiply it. `?? 1` is the fallback the composed wire's
    // `scrap.bid_premium` collapsed to: it was served FROM item.premium.
    const premium = Number(item.premium ?? 1);
    const unit_price = stored
      ? Number(item.price)
      : Number(item.content ?? 0) * (bidFor(item.metal_id) * premium);
    scrap_total += unit_price;
    items.push({
      id: item.id, kind: "scrap", source: stored ? "stored" : "estimate",
      premium, unit_price, line_total: unit_price,
    });
  }

  // The drawers' own bottom line: items minus shipping and payout cost, both
  // read off the order. The EFFECTIVE payout fee, not the stored one - a waived
  // fee does not change payout.cost itself (the record stands), and
  // calculateTotalPrice uses the same helper when the order is finalized.
  const shipping = Number(inboundShipment(order)?.cost ?? 0);
  const total = scrap_total + bullion_total - shipping - effectivePayoutFee(order);

  return { order_id, spots_at, items, scrap_total, bullion_total, total };
}
