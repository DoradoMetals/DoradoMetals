// The quote surface: every number a customer sees, priced by the server on request — client-side money math is banned. Three reads, the pricing halves of flows that already exist:
//
//   catalog        -> the storefront's price on a product, either side
//   sales_order    -> createSalesOrder's pricing path
//   purchase_order -> intake's premium resolution over sell-cart lines
//
// THE PRICE OF METAL COMES ONLY FROM THE SERVER — bodies carry ids/quantities/choices, never prices or spots. A spoofed ask_spot once priced a $3,673.53 order at $26.81; nothing here reads a price-shaped field from a request, and a replay test pins it.
// NOTHING HERE WRITES — a quote is an answer, not a hold; spot movement between quote and order reprices the order (a held quote needs its own table, see FOLLOWUPS).
import * as productService from "#domain/products/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as ratesService from "#domain/rates/service.ts";
import * as servicesService from "#domain/shipping/services/service.ts";
import { payoutFee, PAYOUT_METHOD_FEES } from "#domain/payouts/constants.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";
import * as refinerSpotsService from "#domain/refiners/spots/service.ts";
import * as usersService from "#domain/users/service.ts";
import {
  calculateItemAsk,
  calculateSalesOrderTotal,
  effectivePayoutFee,
  inboundShipment,
  type OrderPrices,
} from "#domain/pricing/service.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";
import type { OrderView, OrderViewItem } from "@dorado/contracts";
import type { RefinerItemRow } from "#db/refiners/items/repo.ts";

// metal_id -> the metal's name, and order_item_id -> what the refinery
// reported. Two lookups the COMPOSED order used to smear onto every line
// (`scrap.metal`, `scrap.content_actual`, `item.refiner_premium`); the
// composer died with D214 item 12 and they are reads of their own tables now.
type MetalNames = ReadonlyMap<string, string>;
type AssayRows = ReadonlyMap<string, RefinerItemRow>;

// req.body, typed the way intake.ts types its block: whatever arrived,
// guarded at every read rather than trusted by declaration.
type Body = Record<string, any>;

interface HttpError extends Error {
  statusCode?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.statusCode = 400;
  return err;
}

// Malformed ids are refused here rather than passed through: get_by_ids casts
// `ANY($1::uuid[])`, so a non-uuid string would answer 22P02 - a 500 for a
// caller mistake.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same gate checkout applies to a cart, applied here to a quote — display/sell_display checked separately, unknown id refused the same as hidden (so the message can't confirm which ids exist).
async function refuseProductsThatAreNotLive(
  ids: string[],
  direction: "display" | "sell_display"
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;

  const rows = await productService.getLiveness(unique);
  const live = new Set(rows.filter((r) => r[direction] === true).map((r) => r.id));
  const refused = unique.filter((id) => !live.has(id));

  if (refused.length > 0) {
    throw badRequest(
      refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`
    );
  }
}

// Bid-side mirror of calculateItemAsk, stated once here rather than imported — pricing/bid.ts's calculateTotalPrice prices SAVED order lines (frozen price, throws on missing spot); this quote surface needs the same ?? 0 stance as the ask side, so both sides of one quote fail the same way.
function calculateItemBid(
  item: { metal_type?: string | null; content?: number | null; bid_premium?: number | null },
  spots: PricingSpot[]
): number {
  const spot = spots.find((s) => s.name === item.metal_type);
  return (item?.content ?? 0) * ((spot?.bid ?? 0) * (item?.bid_premium ?? 0));
}

// ------------------------------------------------------------------ catalog

export type CatalogQuoteLine = {
  id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type CatalogQuote = {
  side: "ask" | "bid";
  spots_at: string;
  items: CatalogQuoteLine[];
  total: number;
};

// The catalogue, priced. PUBLIC (mirrors /spots/spot_prices) — the storefront quotes anyone who visits, and this returns nothing a visitor can't already derive from the public product list and spot feed.
// quantity defaults to 1 (what does ONE cost) — the cart's own getItemsFromServer defaults to 0 instead, since an absent quantity there means a malformed request.
export async function catalogQuote(body: Body): Promise<CatalogQuote> {
  const side = body?.side;
  if (side !== "ask" && side !== "bid") throw badRequest('side must be "ask" or "bid"');

  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length === 0) throw badRequest("a quote needs at least one item");

  const items = raw.map((line: Body, index: number) => {
    const id = line?.id;
    if (typeof id !== "string" || !UUID.test(id)) {
      throw badRequest(`item ${index} has no product id`);
    }
    return { id, quantity: Number(line?.quantity ?? 1) };
  });

  await refuseProductsThatAreNotLive(
    items.map((i) => i.id),
    side === "ask" ? "display" : "sell_display"
  );

  const [rows, spots] = await Promise.all([
    productService.getItemsFromServer(items),
    spotsService.getSpotPrices(),
  ]);
  const spots_at = new Date().toISOString();

  const byId = new Map(rows.map((r) => [r.id, r]));
  const quoted = items.map(({ id, quantity }) => {
    // The liveness gate proved the id exists; a row can still drop out if its metal/mint no longer resolves — refused rather than silently understated.
    const row = byId.get(id);
    if (!row) throw badRequest("That product is not available");
    const unit_price =
      side === "ask" ? calculateItemAsk(row, spots) : calculateItemBid(row, spots);
    return { id, quantity, unit_price, line_total: unit_price * quantity };
  });

  return {
    side,
    spots_at,
    items: quoted,
    total: quoted.reduce((acc, i) => acc + i.line_total, 0),
  };
}

// -------------------------------------------------------------- sales order

export type SalesOrderQuoteLine = {
  id: string;
  quantity: number;
  unit_ask: number;
  line_total: number;
  sales_tax_rate: number;
};

export type SalesOrderQuote = OrderPrices & {
  spots_at: string;
  items: SalesOrderQuoteLine[];
};

// Exactly createSalesOrder's pricing path with the insert removed — same functions, same order, so quote and order can't disagree except by spot movement between them.
// Two deliberate divergences, both about what a quote is asked before the order is: the address is OPTIONAL (absent means taxed in no state, same as a null-state address on the real order); an unknown product id drops out silently (matching getItemsFromServer's behavior on the create path — refusing here would quote a different order than what gets created).
export async function salesOrderQuote(user_id: string, body: Body): Promise<SalesOrderQuote> {
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length === 0) throw badRequest("a quote needs at least one item");

  const items = raw.map((line: Body, index: number) => {
    const id = line?.id;
    if (typeof id !== "string" || !UUID.test(id)) {
      throw badRequest(`item ${index} has no product id`);
    }
    return { id, quantity: Number(line?.quantity ?? 0) };
  });

  // Funds come from the SUBJECT's own row, never the body — subject is resolved server-side (session user, or an admin-named customer) before this runs, and the balance is read fresh rather than taken from the session's cached copy, since that's the balance an order placed after this quote would actually apply. A caller declaring their own balance would be declaring their own discount.
  // ASKED OF THE FEATURE THAT OWNS THE TABLE. This was an inline `SELECT dorado_funds FROM exchange.users`, which was two defects in one line: a raw statement in a service, against a table this feature does not own, and — once migration 118 moved the balance to auth.users — against the copy that had stopped being written. A stale balance here silently overcharges or over-discounts a real order.
  const balance = await usersService.getBalance(user_id);
  if (balance === undefined) {
    const err: HttpError = new Error("no user row for this session");
    err.statusCode = 401;
    throw err;
  }

  let state: string | null = null;
  if (body?.address_id != null) {
    // Resolved by id like the create path — an unknown address is refused with the create path's own message, not silently taxed at zero.
    const address = await addressService.getAddressFromId(String(body.address_id));
    if (!address) throw badRequest(`no address ${body.address_id}`);
    state = address.state ?? null;
  }

  const serverItems = await productService.getItemsFromServer(items);
  const spots = await spotsService.getSpotPrices();
  const spots_at = new Date().toISOString();
  const withTax = await taxService.attachSalesTaxToItems(state, serverItems, spots);

  const prices = calculateSalesOrderTotal(
    withTax as never,
    body?.using_funds,
    spots,
    { dorado_funds: balance == null ? 0 : Number(balance) },
    body?.shipping_service ?? null,
    body?.payment_method ?? null
  );

  const lines = withTax.map((item) => {
    const row = item as { id: string; quantity?: number; sales_tax_rate: number };
    const unit_ask = calculateItemAsk(item as never, spots);
    // quantity ?? 1, matching calculateItemTotals — a line the breakdown counts once must not read as zero here.
    const quantity = Number(row.quantity ?? 1);
    return {
      id: row.id,
      quantity,
      unit_ask,
      line_total: unit_ask * quantity,
      sales_tax_rate: row.sales_tax_rate,
    };
  });

  return { spots_at, ...prices, items: lines };
}

// ----------------------------------------------------------- purchase order

export type PurchaseOrderQuoteLine = {
  index: number;
  kind: "product" | "scrap";
  metal: string;
  content: number;
  premium: number;
  unit_price: number;
  line_total: number;
};

export type PurchaseOrderQuote = {
  spots_at: string;
  items: PurchaseOrderQuoteLine[];
  total: number;
  declared_value: number;
  // The checkout's bottom line (estimated_payout is the headline figure) — returned together with shipping/payout so the three numbers can't disagree.
  shipping_charge: number;
  payout_charge: number;
  estimated_payout: number;
};

// Priced the way intake.ts's decompose prices an order: premium comes ONLY from rates, banded on the metal's TOTAL content across the whole quote (two 5oz gold lines price as a 10oz order); quantity does not multiply into the band total.
// Where decompose leaves a decision to its caller, this quote decides loudly instead: an unrecognized line is refused by index (decompose silently drops it, understating what the customer is owed); a band-less premium is REFUSED for bullion as well as scrap (it used to fall back to the product's catalogue bid_premium, which a purchase never pays); a metal with no spot is refused by index (calculateTotalPrice's TypeError, as a 400 instead).
//
// Returns the PAYOUT, not just the goods total. The old browser math was `quote.total - (shippingCost ?? 0 + paymentCost)` — `+` binds tighter than `??`, so ONE of the two deductions was always silently discarded; with a shipping service selected, the payout fee vanished and the headline read $20 high on a WIRE payout while the rows beneath it said otherwise.
// The fix isn't the parenthesis — the frontend computes no money, the server returns the figure. Same subtraction orderQuote already does for a SAVED order, so the two surfaces agree by construction rather than by two people writing the same expression twice.
//
// Payout fee is resolved from the METHOD NAME, never taken as a number from the body (ids in, data out). features/payouts/constants.ts owns the table — its own header records that production's stored payouts.cost disagrees with it on eleven rows, which is why the table is the default for a NEW order and never a way to re-derive an old one.
//
// Shipping charge is the ONE number this takes from the body — the carrier's already-quoted net charge, which the server can't reproduce without re-quoting FedEx (non-deterministic, slow, a second charge for a rate the caller already holds).
// DISPLAY ONLY: the payout an order actually pays is computed at accept time from the shipment row's own net_charge, so understating this here only inflates the caller's own screen. Refused unless finite and non-negative.
export async function purchaseOrderQuote(body: Body): Promise<PurchaseOrderQuote> {
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length === 0) throw badRequest("a quote needs at least one item");

  // Both deductions are OPTIONAL — the review step quotes before a service or payout method is chosen; a goods-only quote is a real answer.
  const payout_charge = (() => {
    if (body?.payout_method === undefined || body?.payout_method === null) return 0;
    const fee = payoutFee(body.payout_method);
    if (fee === null) {
      throw badRequest(
        `${JSON.stringify(body.payout_method)} is not a payout method - expected one of `
          + Object.keys(PAYOUT_METHOD_FEES).join(", ")
      );
    }
    return fee;
  })();

  const shipping_charge = (() => {
    const v = body?.shipping_charge;
    if (v === undefined || v === null || v === "") return 0;
    // Narrowed to what a caller can legitimately send (a number, or a non-empty string that parses to one) rather than passed through Number() — `Number([])`, `Number("")` and `Number(null)` are all 0, so a bare Number() check would accept a MISSING shipping charge as a legitimate zero, quoting a payout that's TOO HIGH (the exact class of bug this surface exists to end; same trap as users/service.ts's credit amount).
    // Caught by the test below, which sends each of those three.
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string" && v.trim() !== ""
          ? Number(v)
          : NaN;
    if (!Number.isFinite(n) || n < 0) {
      throw badRequest(`shipping_charge ${JSON.stringify(v)} is not a charge`);
    }
    return n;
  })();

  type Parsed =
    | { index: number; kind: "product"; id: string; quantity: number }
    | { index: number; kind: "scrap"; metal: string; content: number };

  const parsed: Parsed[] = [];
  for (const [index, line] of (raw as Body[]).entries()) {
    const data: Body = line?.data ?? {};

    if (line?.type === "product") {
      let id: string | null =
        typeof data.id === "string" && UUID.test(data.id) ? data.id : null;
      if (!id) {
        // Both spellings checked — sell-cart lines carry the product name at different keys across renames; reading only one made product lines vanish silently.
        const name = line?.product_name ?? data.name ?? data.product_name;
        // Resolved through products' own service (owns the table) rather than reaching into checkout's repo directly — the id must be a products.bullion id anyway, since the liveness gate and getItemsFromServer both key on it.
        if (name != null) id = await productService.findProductIdByName(String(name));
      }
      if (!id) throw badRequest(`item ${index} names no product the server recognises`);
      // Quantity rides on the line's data in the frontend's shape; top-level
      // kept first, matching replaceSellItems.
      parsed.push({
        index,
        kind: "product",
        id,
        quantity: Number(line?.quantity ?? data.quantity ?? 1),
      });
      continue;
    }

    if (line?.type === "scrap") {
      const metal = typeof data.metal === "string" ? data.metal.trim() : "";
      if (!metal) throw badRequest(`item ${index} is scrap with no metal`);
      // Content is either the stated value, or the server's own derivation from pre_melt/purity/unit — turning declared weights into troy-ounce content is arithmetic, and client arithmetic is exactly what this surface replaces. A stated content wins when both arrive, matching intake.ts.
      const content =
        data.content != null && Number.isFinite(Number(data.content))
          ? Number(data.content)
          : convertTroyOz(
              Number(data.pre_melt ?? 0),
              String(data.gross_unit ?? data.unit ?? "t oz")
            ) * Number(data.purity ?? 0);
      parsed.push({ index, kind: "scrap", metal, content });
      continue;
    }

    throw badRequest(`item ${index} is neither a product nor scrap`);
  }

  // Same gate the sell-cart sync applies — a product may only be quoted in the direction it's live in; scrap has nothing to check.
  const productIds = parsed.flatMap((l) => (l.kind === "product" ? [l.id] : []));
  await refuseProductsThatAreNotLive(productIds, "sell_display");

  const [rows, spots, rates] = await Promise.all([
    // quantity 0 because only the row is wanted here - each line below keeps
    // its own quantity, so duplicate ids cannot collapse into one.
    productService.getItemsFromServer([...new Set(productIds)].map((id) => ({ id, quantity: 0 }))),
    spotsService.getSpotPrices(),
    ratesService.getAllRates(),
  ]);
  const spots_at = new Date().toISOString();
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Metal, content and premium resolved server-side — a product's come from its row, never the body; scrap's metal matches the spot case-insensitively, same as replaceSellItems.
  const lines = parsed.map((l) => {
    if (l.kind === "product") {
      const row = byId.get(l.id);
      if (!row) throw badRequest("That product is not available");
      return {
        index: l.index,
        kind: l.kind,
        metal: row.metal_type,
        content: Number(row.content ?? 0),
        quantity: l.quantity,
      };
    }
    const spot = spots.find(
      (s) => String(s.name).toLowerCase() === l.metal.toLowerCase()
    );
    if (!spot) throw badRequest(`item ${l.index} names a metal with no spot price`);
    return {
      index: l.index,
      kind: l.kind,
      metal: String(spot.name),
      content: l.content,
      quantity: 1,
    };
  });

  // A BULLION LINE'S CONTENT IS PER UNIT; A SCRAP LINE'S IS THE WHOLE LINE.
  //
  // The band is chosen on the total content of a metal across the quote, so six
  // 1 oz Eagles are six ounces and must quote the 5-10 oz band. Counting
  // `content` alone counted the line as one ounce however many were in it, so a
  // cart quoted a lower band than the order it became actually paid - the quote
  // and the placement disagreeing on price, which is the one thing this surface
  // exists to prevent. Scrap keeps `content` because a scrap line's content
  // already describes the whole parcel and its quantity is pinned at 1 above.
  const totals = sumContentByMetal(
    lines,
    (l) => l.metal,
    (l) => (l.kind === "scrap" ? l.content : l.content * l.quantity)
  );

  const quoted = lines.map((l) => {
    const band = getRatePct(
      rates,
      l.metal,
      totals[String(l.metal ?? "").trim().toLowerCase()] ?? 0,
      l.kind === "scrap" ? "scrap" : "bullion"
    );
    // REFUSED RATHER THAN FALLING BACK, for bullion as well as scrap. This read
    // `band ?? l.own_premium`, so a metal with no configured band quoted the
    // product's catalogue bid_premium - a number the placed order would not
    // pay, because a purchase prices every line from the rate tier. A quote the
    // order will not honour is worse than no quote: the customer sees a figure,
    // agrees to it, and is paid something else.
    const premium = band;
    if (premium == null) {
      throw badRequest(`no rate is configured for ${l.metal} ${l.kind}`);
    }
    const unit_price = calculateItemBid(
      { metal_type: l.metal, content: l.content, bid_premium: premium },
      spots
    );
    return {
      index: l.index,
      kind: l.kind,
      metal: l.metal,
      content: l.content,
      premium,
      unit_price,
      // Scrap is not multiplied by quantity: its content already describes
      // the whole line, which is how calculateTotalPrice and the frontend's
      // getDeclaredValue both sum it.
      line_total: l.kind === "product" ? unit_price * l.quantity : unit_price,
    };
  });

  const total = quoted.reduce((acc, l) => acc + l.line_total, 0);

  // Declared value is the total, capped by what we'll insure. Was a bare total with the cap applied in the browser as a hardcoded `Math.min(total, 50000)` — FedEx's ceiling, deciding parcel coverage from a literal in React. Now a column, shipping.services.max_insured_value (10,000 on every row), applied here instead.
  // Service-agnostic by necessity: a quote is priced before a service is chosen, so this uses the LOWEST ceiling among offered services — the label path later narrows to the chosen one, which can only lower it further.
  // Prices from rate bands rather than the cart line's own bid_premium, a deliberate divergence from the old client math.
  const declared_value = Math.min(total, await servicesService.insuranceCeiling());

  return {
    spots_at,
    items: quoted,
    total,
    declared_value,
    shipping_charge,
    payout_charge,
    // Never below zero — a small order whose fees exceed its value doesn't owe the business money, and a negative headline isn't a number to show.
    estimated_payout: Math.max(0, total - shipping_charge - payout_charge),
  };
}


// ------------------------------------------------------- existing order

export type OrderQuoteLine = {
  id: string;
  kind: "product" | "scrap";
  source: "stored" | "estimate";
  premium: number;
  unit_price: number;
  line_total: number;
};

export type OrderQuote = {
  order_id: string;
  spots_at: string;
  items: OrderQuoteLine[];
  scrap_total: number;
  bullion_total: number;
  total: number;
};

// An EXISTING purchase order, priced — replaces the drawer's client-side estimate. Loaded through the same read the drawer's own GET uses, so items/premiums match exactly. requireOwnOrder already checked ownership upstream; nothing here re-reads it, and nothing in the body is used but the order id.
//
// Per metal: the order's own frozen bid when set, else the live spot — equivalent to how finalizePricing distinguishes locked/unlocked (a non-null frozen bid IS the locked state). A locked order estimates at its locked spots, an unlocked one at live; an admin's per-metal override is honored the same way the drawer honored it.
//
// STORED price wins where the accept flow froze one; otherwise: product = content * bid * premium, * quantity; scrap = content * bid * (premium ?? scrap's own bid_premium ?? 1), quantity not multiplied (content covers the whole line).
// THE PRODUCT CHAIN NO LONGER FALLS BACK TO THE CATALOGUE. On a PURCHASE every line prices from the rate tier — scrap by scrap_pct, bullion by bullion_pct, banded on the order's total content of that metal — and the product's own bid_premium plays no part in what the business pays. It was in this chain only because the drawer's client-side estimate had it, and mirroring the drawer's arithmetic is what this function was written to do; mirroring an arithmetic the placed order does not use quotes a number the customer will not be paid. The line's own stored premium is the tier that was resolved when it was priced, so `premium ?? 0` is the whole chain.
// The scrap chain KEEPS its two fallbacks: `scrap.bid_premium` there is a wire alias for the line's own resolved premium, not a catalogue default, so dropping it would blank a real value.
// scrap_total/bullion_total are sums of THESE lines — the legacy total used `premium ?? 1` with no bid_premium fallback and could disagree with its own displayed lines when premium was null.
//
// A metal with no spot anywhere prices at 0, not a throw — this is a drawer estimate for an order that already exists and must render; the accept path keeps calculateTotalPrice's throw.
export async function orderQuote(body: Body): Promise<OrderQuote> {
  const order_id = body?.order_id;
  if (typeof order_id !== "string" || !UUID.test(order_id)) {
    throw badRequest("no order was named");
  }

  const order = await orderRead.view(order_id);
  if (!order) {
    // requireOwnOrder answers 403 for a customer naming an order that is not
    // theirs or does not exist; only an admin (or a sales-order id, which the
    // guard also owns) reaches this.
    const err: HttpError = new Error("no such purchase order");
    err.statusCode = 404;
    throw err;
  }

  const [liveSpots, frozenSpots] = await Promise.all([
    spotsService.getSpotPrices(),
    orderSpotsService.rowsFor(order_id),
  ]);
  const spots_at = new Date().toISOString();

  // KEYED BY METAL ID, where this used to match on the metal's display NAME.
  // A line names its metal by id and always has; the name was a join the
  // composed order carried.
  const pinned = new Map(frozenSpots.map((s) => [s.metal_id, s.bid]));
  const live = new Map(liveSpots.map((s) => [s.id, s.bid]));
  const bidFor = (metal_id: string): number => {
    const frozen = pinned.get(metal_id);
    if (frozen != null) return Number(frozen);
    return Number(live.get(metal_id) ?? 0);
  };

  const items: OrderQuoteLine[] = [];
  let scrap_total = 0;
  let bullion_total = 0;

  for (const item of order.items) {
    const stored = item.price != null;

    if (item.bullion_id !== null) {
      // NO CATALOGUE FALLBACK - see this function's header. A purchase pays the
      // rate tier, and item.premium is the tier this line was priced at.
      const premium = Number(item.premium ?? 0);
      const unit_price = stored
        ? Number(item.price)
        : Number(item.product?.content ?? 0) * (bidFor(item.metal_id) * premium);
      // A stored price is PER UNIT: every consumer of it - the footers,
      // purchaseOrderTotal, calculateTotalPrice - multiplies by quantity.
      const line_total = unit_price * Number(item.quantity ?? 1);
      bullion_total += line_total;
      items.push({
        id: item.id,
        kind: "product",
        source: stored ? "stored" : "estimate",
        premium,
        unit_price,
        line_total,
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
      id: item.id,
      kind: "scrap",
      source: stored ? "stored" : "estimate",
      premium,
      unit_price,
      line_total: unit_price,
    });
  }

  // The drawers' own bottom line: items minus shipping and payout cost, both read off the order — `?? 0` where the frontend read `payout.cost` bare (an orphaned order carries nulls, not a missing object).
  const shipping = Number(inboundShipment(order)?.cost ?? 0);
  // The EFFECTIVE fee, not the stored one — a waived payout fee doesn't change payout.cost itself (the record stands); calculateTotalPrice uses the same helper when the order is finalized, so the two never disagree by construction.
  const payoutCost = effectivePayoutFee(order);
  const total = scrap_total + bullion_total - shipping - payoutCost;

  return { order_id, spots_at, items, scrap_total, bullion_total, total };
}

// ------------------------------------------------------ profit breakdown

// The last client-side money math, ported byte-for-byte from the frontend's own calculatePurchaseOrderTotals (the numbers are the business's margins, and the frontend copy died with the orders wire conversion) — kept faithful rather than improved; anything that looks odd here looked exactly as odd in the original.
//
// ADMIN ONLY as a property of the DATA, not just the route — this splits what the business and the refiner each make on a customer's order.
//
// Server-sourced throughout — the order (admin read, since assay actuals ride only on it), frozen spots, refiner spots, and rate bands. The body supplies only the order id; a replay test pins that a poisoned body changes nothing.

type ProfitMetal = { content: number; percentage: number; profit: number };
type ProfitMetalsDict = {
  gold: ProfitMetal; silver: ProfitMetal; platinum: ProfitMetal; palladium: ProfitMetal;
};
type ProfitCategories = {
  scrap: ProfitMetalsDict;
  bullion: ProfitMetalsDict;
  total: ProfitMetalsDict;
  shipping_net: number;
  refiner_fee_net: number;
  spot_net: number;
  total_profit: number;
};
export type ProfitBreakdown = {
  order_id: string;
  spots_at: string;
  refiner: ProfitCategories;
  dorado: ProfitCategories;
  customer: ProfitCategories;
};

type MetalName = "Gold" | "Silver" | "Platinum" | "Palladium";
type MetalKey = "gold" | "silver" | "platinum" | "palladium";
// The spot as this math reads it - the metal it prices and the bid.
type ProfitSpot = { metal_id: string; bid: number | null };

const PROFIT_METALS: MetalName[] = ["Gold", "Silver", "Platinum", "Palladium"];
const toKey = (m: MetalName): MetalKey => m.toLowerCase() as MetalKey;

const emptyMetalsDict = (): ProfitMetalsDict => ({
  gold: { content: 0, percentage: 0, profit: 0 },
  silver: { content: 0, percentage: 0, profit: 0 },
  platinum: { content: 0, percentage: 0, profit: 0 },
  palladium: { content: 0, percentage: 0, profit: 0 },
});

const getItemMetal = (item: OrderViewItem, metals: MetalNames): MetalName | null =>
  (metals.get(item.metal_id) ?? null) as MetalName | null;

// A scrap line's content covers the whole lot; a bullion line's is per coin,
// so it multiplies by how many.
const getItemContent = (item: OrderViewItem): number => {
  if (item.bullion_id === null) return item.content ?? 0;
  return Number(item.product?.content ?? 0) * Number(item.quantity ?? 1);
};

// WHAT THE REFINERY ACTUALLY REPORTED for a scrap line - refiners.items, its
// own table, keyed by the order line. The composed wire served these three as
// scrap.content_actual / post_melt_actual / purity_actual.
const getScrapActualContent = (item: OrderViewItem, assay: AssayRows): number | null => {
  if (item.bullion_id !== null) return null;
  const reported = assay.get(item.id);
  if (!reported) return null;
  if (typeof reported.content === "number") return reported.content;
  if (typeof reported.post_melt === "number" && typeof reported.purity === "number") {
    return reported.post_melt * reported.purity;
  }
  return null;
};

const getProfitSpot = (spots: ProfitSpot[], metal_id: string): ProfitSpot | null =>
  spots.find((s) => s.metal_id === metal_id) ?? null;

type Shares = { customerShare: number; doradoShare: number; refinerShare: number };
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function premiumsToShares(
  category: "scrap" | "bullion" | "total",
  doradoPremium?: number | null,
  refinerPremium?: number | null
): Shares {
  let d = doradoPremium ?? undefined;
  let r = refinerPremium ?? undefined;

  if (d == null && r != null) d = r;
  if (r == null && d != null) r = d;

  if (d == null && r == null && (category === "bullion" || category === "total")) {
    return { customerShare: 1, doradoShare: 0, refinerShare: 0 };
  }

  if (d == null) d = 1;
  if (r == null) r = 1;

  d = clamp01(d);
  r = clamp01(r);

  let customerShare = d;
  let doradoShare = Math.max(r - d, 0);
  let refinerShare = 1 - r;

  const sum = customerShare + doradoShare + refinerShare;
  if (Math.abs(sum - 1) > 1e-9) {
    const remainder = Math.max(1 - customerShare, 0);
    const dr = doradoShare + refinerShare;
    if (dr > 0) {
      const scale = remainder / dr;
      doradoShare *= scale;
      refinerShare *= scale;
    } else {
      doradoShare = remainder;
    }
  }

  return {
    customerShare: clamp01(customerShare),
    doradoShare: clamp01(doradoShare),
    refinerShare: clamp01(refinerShare),
  };
}

function getSharesForItem(
  item: OrderViewItem,
  metal: MetalName,
  orderSpots: ProfitSpot[],
  refinerSpots: ProfitSpot[],
  category: "scrap" | "bullion" | "total",
  rates: Parameters<typeof getRatePct>[0],
  scrapTotalsByMetal: Record<string, number>,
  assay: AssayRows
) {
  const orderSpot = getProfitSpot(orderSpots, item.metal_id);
  const refSpot = getProfitSpot(refinerSpots, item.metal_id);

  // For scrap, the default dorado premium comes from the rates table, tiered by
  // total scrap of this metal in the order. An explicit item.premium (admin
  // override) always wins.
  const ratePremium =
    item.bullion_id === null
      ? getRatePct(rates, metal, scrapTotalsByMetal[metal.toLowerCase()] ?? 0, "scrap")
      : undefined;

  const doradoPremium =
    item.premium != null ? Number(item.premium) : ratePremium ?? undefined;

  const reported = assay.get(item.id)?.premium;
  const refinerPremium = reported != null ? Number(reported) : undefined;

  const shares = premiumsToShares(category, doradoPremium, refinerPremium);
  return {
    customerShare: shares.customerShare,
    doradoShare: shares.doradoShare,
    refinerShare: shares.refinerShare,
    orderSpot,
    refSpot,
  };
}

function computeMetalsForAllParties(
  order: OrderView,
  category: "scrap" | "bullion" | "total",
  orderSpots: ProfitSpot[],
  refinerSpots: ProfitSpot[],
  rates: Parameters<typeof getRatePct>[0],
  scrapTotalsByMetal: Record<string, number>,
  metals: MetalNames,
  assay: AssayRows
) {
  const customer = emptyMetalsDict();
  const refiner = emptyMetalsDict();
  const dorado = emptyMetalsDict();

  for (const item of order.items) {
    const metal = getItemMetal(item, metals);
    if (!metal) continue;

    const isScrap = item.bullion_id === null;
    const isBullion = !isScrap;
    if ((category === "scrap" && !isScrap) || (category === "bullion" && !isBullion)) continue;

    const baseContent = getItemContent(item);

    if (!baseContent) continue;

    const { customerShare, doradoShare, refinerShare, orderSpot, refSpot } = getSharesForItem(
      item,
      metal,
      orderSpots,
      refinerSpots,
      category,
      rates,
      scrapTotalsByMetal,
      assay
    );
    // doradoShare is derived and never read below - the dorado slice is what
    // remains after the other two, exactly as the frontend computed it.
    void doradoShare;

    const actualScrap = isScrap ? getScrapActualContent(item, assay) : null;

    const dorRefContentBasis = isScrap ? actualScrap ?? baseContent : baseContent;

    const custContent = baseContent * customerShare;
    const refContent = dorRefContentBasis * refinerShare;
    const dorContent = dorRefContentBasis - custContent - refContent;

    const key = toKey(metal);
    const orderBid = orderSpot?.bid ?? 0;
    const refBid = refSpot?.bid ?? 0;

    customer[key].content += custContent;
    customer[key].profit += custContent * orderBid;

    dorado[key].content += dorContent;
    dorado[key].profit += dorContent * refBid;

    refiner[key].content += refContent;
    refiner[key].profit += refContent * refBid;
  }

  for (const metal of PROFIT_METALS) {
    const key = toKey(metal);
    const denom = customer[key].content + dorado[key].content + refiner[key].content;

    const pct = (owned: number) => (denom ? (owned / denom) * 100 : 0);

    customer[key].percentage = pct(customer[key].content);
    dorado[key].percentage = pct(dorado[key].content);
    refiner[key].percentage = pct(refiner[key].content);
  }

  return { customer, refiner, dorado };
}

function getShippingFees(order: OrderView) {
  return {
    refiner: 0,
    dorado: Number(order.totals?.shipping_fee_actual ?? 0),
    customer: Number(inboundShipment(order)?.cost ?? 0),
  };
}

function getSpotNet(
  customerTotals: ProfitMetalsDict,
  orderSpots: ProfitSpot[],
  refinerSpots: ProfitSpot[],
  metals: MetalNames
) {
  let sum = 0;
  const idOf = new Map([...metals].map(([id, name]) => [name.toLowerCase(), id]));

  for (const metal of PROFIT_METALS) {
    const key = toKey(metal);
    const qty = customerTotals[key]?.content ?? 0;
    if (!qty) continue;

    const metal_id = idOf.get(metal.toLowerCase());
    if (!metal_id) continue;
    const orderBid = getProfitSpot(orderSpots, metal_id)?.bid;
    const refBid = getProfitSpot(refinerSpots, metal_id)?.bid;
    if (orderBid == null || refBid == null) continue;

    sum += qty * (refBid - orderBid);
  }

  return {
    refiner: 0,
    dorado: sum,
    customer: 0,
  };
}

function getTotalProfit(
  totalMetals: ProfitMetalsDict,
  shippingFee: number,
  spotNet: number = 0,
  refiner_fee: number = 0
): number {
  const metalsProfit =
    (totalMetals.gold?.profit ?? 0) +
    (totalMetals.silver?.profit ?? 0) +
    (totalMetals.platinum?.profit ?? 0) +
    (totalMetals.palladium?.profit ?? 0);

  return metalsProfit + spotNet - shippingFee - refiner_fee;
}

export async function profitBreakdown(body: Body): Promise<ProfitBreakdown> {
  const order_id = body?.order_id;
  if (typeof order_id !== "string" || !UUID.test(order_id)) {
    throw badRequest("no order was named");
  }

  // ONE ORDER, READ BY ID. It used to read EVERY purchase order and find this
  // one in the array - because the assay actuals rode only on the admin list's
  // projection. They are refiners.items rows now, read below by the same id,
  // so the whole-table read is gone.
  const order = await orderRead.view(order_id);
  if (!order) {
    const err: HttpError = new Error("no such purchase order");
    err.statusCode = 404;
    throw err;
  }

  const [frozenSpots, refinerNamed, rates, metals, assayRows] = await Promise.all([
    orderSpotsService.rowsFor(order_id),
    refinerSpotsService.namedFor(order_id),
    ratesService.getAllRates(),
    metalsRepo.namesById(),
    refinerItemsRepo.getForOrder(order_id),
  ]);
  const spots_at = new Date().toISOString();

  // Both spot sets keyed by the metal they price. The refiner's are named
  // rather than keyed, so the name is resolved back to its id once.
  const idOfMetal = new Map([...metals].map(([id, name]) => [name.toLowerCase(), id]));
  const orderSpots: ProfitSpot[] = frozenSpots.map((s) => ({ metal_id: s.metal_id, bid: s.bid }));
  const refinerSpots: ProfitSpot[] = refinerNamed.flatMap((s) => {
    const metal_id = idOfMetal.get(String(s.name ?? "").toLowerCase());
    return metal_id ? [{ metal_id, bid: s.bid }] : [];
  });
  const assay: AssayRows = new Map(assayRows.map((r) => [r.order_item_id, r]));

  // Total scrap content per metal for rate tiering (per-metal, order total).
  const scrapTotalsByMetal = sumContentByMetal(
    order.items.filter((i) => i.bullion_id === null),
    (i) => getItemMetal(i, metals),
    (i) => getItemContent(i)
  );

  const parties = (category: "scrap" | "bullion" | "total") =>
    computeMetalsForAllParties(
      order, category, orderSpots, refinerSpots, rates, scrapTotalsByMetal, metals, assay
    );

  const scrap = parties("scrap");
  const bullion = parties("bullion");
  const total = parties("total");
  const shipping = getShippingFees(order);
  const spotNet = getSpotNet(total.customer, orderSpots, refinerSpots, metals);

  // The money nested as totals since D84; the refiner fee lives there.
  const refinerFee = order.totals?.refiner_fee ?? 0;

  return {
    order_id,
    spots_at,
    refiner: {
      scrap: scrap.refiner,
      bullion: bullion.refiner,
      total: total.refiner,
      shipping_net: shipping.refiner,
      refiner_fee_net: 0,
      spot_net: spotNet.refiner,
      total_profit: getTotalProfit(total.refiner, shipping.refiner, spotNet.refiner, 0),
    },
    dorado: {
      scrap: scrap.dorado,
      bullion: bullion.dorado,
      total: total.dorado,
      shipping_net: shipping.customer - shipping.dorado,
      refiner_fee_net: -Math.abs(Number(refinerFee ?? 0)),
      spot_net: spotNet.dorado,
      total_profit: getTotalProfit(
        total.dorado,
        shipping.dorado - shipping.customer,
        spotNet.dorado,
        refinerFee
      ),
    },
    customer: {
      scrap: scrap.customer,
      bullion: bullion.customer,
      total: total.customer,
      shipping_net: shipping.dorado - shipping.customer,
      // Same effective fee the order total and the drawer estimate use: a
      // waived fee is not deducted from what the customer nets.
      refiner_fee_net: -Math.abs(effectivePayoutFee(order)),
      spot_net: spotNet.customer,
      total_profit: getTotalProfit(
        total.customer,
        shipping.customer,
        spotNet.customer,
        effectivePayoutFee(order)
      ),
    },
  };
}
