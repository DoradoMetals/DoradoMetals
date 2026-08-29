// The quote surface: every number a customer sees, priced by the server on
// request. Jacob's ruling (FOLLOWUPS.md, 2026-08-28 evening, item 3) kills
// all client-side money math, and these three reads are what replaces it -
// the pricing halves of flows that already exist, with the writes taken off:
//
//   catalog        -> the storefront's price on a product, either side
//   sales_order    -> createSalesOrder's pricing path (sales-orders/service.ts)
//   purchase_order -> intake.ts's premium resolution over sell-cart lines
//
// THE PRICE OF METAL COMES FROM THE SERVER, AND ONLY FROM THE SERVER. Bodies
// carry items and choices - ids, quantities, weights, a shipping service -
// never prices and never spots. getSpotPrices' header holds the measurement
// that made this a rule: the same order priced at $3,673.53 honest and $26.81
// with ask_spot 1 riding in the body. Nothing below reads a price-shaped
// field off a request, and the replay test posts one and pins that it
// changes nothing.
//
// NOTHING HERE WRITES. A quote is an answer, not a hold: spot moving between
// the quote and the order reprices the order, which is the behaviour
// createSalesOrder already documents. A quote held for a few minutes needs a
// table and is written up in FOLLOWUPS.
import * as productService from "#features/products/service.ts";
import * as spotsService from "#features/spots/service.ts";
import * as taxService from "#features/sales-tax/service.ts";
import * as addressService from "#features/places/addresses/service.ts";
import * as ratesService from "#features/rates/service.ts";
import * as checkoutRepo from "#features/checkout/repo.next.ts";
import { payoutFee, PAYOUT_METHOD_FEES } from "#features/payouts/constants.ts";
import * as purchaseOrdersService from "#features/orders/service.ts";
import {
  calculateItemAsk,
  calculateSalesOrderTotal,
  type OrderPrices,
} from "#features/pricing/service.ts";
import { getRatePct, sumContentByMetal } from "#features/rates/utils/resolveRate.ts";
import query from "#shared/db/query.js";
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import type { PricingSpot } from "#features/pricing/service.ts";

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

// The gate checkout's refuseProductsThatAreNotLive applies to a cart, applied
// to a quote, with the same stance: `display` governs buying from the
// business, `sell_display` selling to it, and an unknown id is refused the
// same way a hidden one is - telling them apart in the message would confirm
// which ids exist.
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

// The bid-side mirror of calculateItemAsk, stated once. There is nothing to
// import for it: calculateTotalPrice (pricing/bid.ts)
// prices SAVED order lines - it honours a frozen item.price and deliberately
// throws on a missing spot - and the frontend's getProductBidPrice is exactly
// what this surface exists to replace. Same expression as the ask, same ?? 0
// stance: the two sides of one quote should fail the same way, and
// calculateItemAsk prices a missing spot at zero rather than throwing.
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

// The catalogue, priced. PUBLIC, mirroring /spots/spot_prices: the storefront
// quotes prices to anyone who visits, and this returns nothing a visitor
// cannot already derive from the public product list and the public spot feed.
//
// quantity defaults to 1, calculateItemTotals' own default: a catalogue quote
// with no quantity asks what one costs. getItemsFromServer's ?? 0 is the cart
// stance, where an absent quantity means the request was malformed.
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
    // The liveness gate proved the id exists; compose.storefront can still
    // drop a row whose metal or mint no longer resolves. A quote silently
    // missing a line understates, so it refuses instead - with the gate's
    // own message, for the gate's own reason.
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

// EXACTLY createSalesOrder's pricing path with the insert taken off:
// getItemsFromServer -> the address's state -> attachSalesTaxToItems ->
// calculateSalesOrderTotal. Same functions, same order, so the quote and the
// order it precedes cannot disagree except by spot movement in between.
//
// Two deliberate divergences from the create path, both about what a quote is
// asked before:
//   - the address is OPTIONAL. A quote runs before the address step; absent
//     means taxed in no state, which attachSalesTaxToItems already handles -
//     rules matched against a null state COALESCE to a rate of zero, the
//     same behaviour updateStateSalesTax documents for a null-state address.
//   - an unknown product id drops out silently, because that is what
//     getItemsFromServer does on the create path and a quote that refuses
//     where the order would price would quote a different order.
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

  // THE FUNDS COME FROM THE SUBJECT'S ROW, NEVER THE BODY. The subject is the
  // session user - or the customer an ADMIN named, resolved by the
  // controller's subjectOf before this is called; nothing here reads an id
  // off the body. The create path reads session.user.dorado_funds -
  // better-auth's serving of the same column, declared as an additionalField
  // in auth/client.ts. The quote reads the row itself: usersService.getUser
  // deliberately projects no balance (users/sql/get_one.sql - "preserved
  // rather than harmonised"), and exchange.users is the table removeFunds
  // writes, so it is the balance an order placed after this quote would
  // actually apply. Read the way the order read.services read their user
  // rows. A caller declaring their own balance would be declaring their own
  // discount.
  const { rows: funded } = await query(
    `SELECT dorado_funds FROM exchange.users WHERE id = $1`,
    [user_id]
  );
  const user = funded[0];
  if (!user) {
    const err: HttpError = new Error("no user row for this session");
    err.statusCode = 401;
    throw err;
  }

  let state: string | null = null;
  if (body?.address_id != null) {
    // Resolved by id like the create path - an id the server cannot find is
    // refused with the create path's own message rather than quietly taxed
    // in no state.
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
    { dorado_funds: user.dorado_funds == null ? 0 : Number(user.dorado_funds) },
    body?.shipping_service ?? null,
    body?.payment_method ?? null
  );

  const lines = withTax.map((item) => {
    const row = item as { id: string; quantity?: number; sales_tax_rate: number };
    const unit_ask = calculateItemAsk(item as never, spots);
    // quantity ?? 1, matching calculateItemTotals: the sum of these lines IS
    // item_total, and a line the breakdown counted once must not read as zero.
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
  // The three below are the CHECKOUT's bottom line, and they exist because the
  // browser was computing it (D97). `estimated_payout` is the headline figure
  // above "Confirm and Place Order"; the other two are the rows printed
  // underneath it, returned together so the three cannot disagree.
  shipping_charge: number;
  payout_charge: number;
  estimated_payout: number;
};

// What the business would pay for a sell cart, priced the way intake.ts's
// decompose prices an order: THE PREMIUM COMES FROM RATES, AND FROM NOWHERE
// ELSE, banded on the metal's TOTAL content across the whole quote - two 5oz
// gold lines are a 10oz order and price at the 10oz band. Same helpers
// (getRatePct, sumContentByMetal), same per-line content in the band total
// (quantity deliberately does not multiply into it - decompose and
// retierScrapPremiums both band on line content), and the same rates read the
// intake callers make: ratesService.getAllRates, the composed shape
// resolveRate keys on by metal NAME.
//
// Where decompose leaves a decision to its caller, the quote IS the caller,
// and decides loudly:
//   - decompose DROPS a line it does not recognise; a quote refuses it by
//     index instead, because a total silently missing a line understates
//     what the customer is owed.
//   - decompose leaves a band-less premium null. Here a product falls back
//     to its row's own bid_premium - the value replaceSellItems writes on
//     the cart line - and scrap without a band is refused: the alternatives
//     are the 0.75 hardcode intake's header dug out, or pricing a customer's
//     metal at nothing.
//   - a metal with no spot is refused by index, calculateTotalPrice's
//     refuse-to-price stance as a 400 rather than its TypeError.
//
// AND IT RETURNS THE PAYOUT, NOT JUST THE GOODS TOTAL (D97). The checkout's
// "Estimated Payout" figure was `(quote?.total ?? 0) - (shippingCost ?? 0 +
// paymentCost)`, and `+` binds tighter than `??`, so that parses as
// `shippingCost ?? (0 + paymentCost)`: whichever deduction the ?? chose, the
// OTHER ONE WAS SILENTLY DISCARDED, and the two could never both apply. With a
// shipping service selected - the normal case - the payout fee vanished and
// the number above the Confirm button read $20 high on a WIRE payout, while
// the Shipping and Payout-Method-Fee rows immediately beneath it said
// otherwise. The fix is not the parenthesis (ruling D82): the frontend does not
// compute money, so the server returns the figure and the component displays
// it. Same subtraction orderQuote already does for a SAVED order -
// `scrap_total + bullion_total - shipping - payoutCost` - which is why the two
// surfaces now agree by construction rather than by two people writing the
// same expression twice.
//
// THE PAYOUT FEE IS RESOLVED FROM THE METHOD NAME, never taken as a number
// from the body - ruling 10, ids in, data out. features/payouts/constants.ts
// owns the table, and its header records that production's stored
// payouts.cost disagrees with it on eleven rows, which is why that table is
// the default for a NEW order and never a way to re-derive an old one.
//
// THE SHIPPING CHARGE IS THE ONE NUMBER THIS TAKES FROM THE BODY, and it is
// worth being honest about why rather than pretending otherwise. It is the
// carrier's quoted net charge, which the server cannot reproduce without
// re-quoting FedEx - non-deterministic, slow, and a second charge for a rate
// the caller already holds from the shipping endpoint. It is DISPLAY ONLY: the
// payout an order actually pays is computed at accept time from the shipment
// row's own net_charge, so understating it here buys a caller a bigger number
// on their own screen and nothing else. Refused unless it is a finite number
// that is not negative.
export async function purchaseOrderQuote(body: Body): Promise<PurchaseOrderQuote> {
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length === 0) throw badRequest("a quote needs at least one item");

  // Both deductions are OPTIONAL: the review step quotes before a service or a
  // payout method has been chosen, and a quote of the goods alone is a real
  // answer. Absent means zero deducted, which is what the screen shows.
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
    // NARROWED TO THE TWO THINGS A CALLER CAN LEGITIMATELY SEND - a real
    // number, or a non-empty string that parses to one - rather than passed
    // through Number().
    //
    // `Number([])` is 0. So is `Number("")` and `Number(null)`. A bare
    // Number() check accepts all three as a finite, non-negative charge, and
    // zero shipping quotes a payout that is TOO HIGH, which is the exact class
    // of bug this whole change exists to end. Caught by the test below, which
    // sends each of them. Same trap, same fix, as
    // features/users/service.ts's credit amount (D98) - and it was written the
    // wrong way here first, which is why the test sends `[]`.
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
        // BOTH SPELLINGS, the D73 lesson from replaceSellItems: sell-cart
        // lines carry the name at data.name since the products rename,
        // data.product_name before it, and top-level product_name from the
        // oldest shape. Reading only one made product lines vanish silently.
        const name = line?.product_name ?? data.name ?? data.product_name;
        if (name != null) id = await checkoutRepo.findProductIdByName(String(name));
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
      // The content the customer declared, or the server's own derivation
      // from what they declared it from. pre_melt, purity and the unit are
      // goods declarations - the business assays on receipt - but turning
      // them into troy-ounce content is arithmetic, and client arithmetic is
      // what this surface replaces (ReviewStep.tsx computes exactly this
      // expression). A stated content wins when both arrive, matching
      // intake.ts item(), which trusts data.content first.
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

  // The gate the sell-cart sync applies: a product may only be quoted in the
  // direction it is live in. Scrap carries its own values and names no
  // product, so it has nothing to check.
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

  // Canonical metal, content and the product's own premium per line, resolved
  // server-side. A product's metal and content come from its row, never the
  // body; scrap's metal is matched to the spot case-insensitively, the way
  // replaceSellItems matches lower(name), and the SPOT's spelling is what the
  // response carries.
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
        own_premium: row.bid_premium == null ? null : Number(row.bid_premium),
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
      own_premium: null,
    };
  });

  const totals = sumContentByMetal(lines, (l) => l.metal, (l) => l.content);

  const quoted = lines.map((l) => {
    const band = getRatePct(
      rates,
      l.metal,
      totals[String(l.metal ?? "").trim().toLowerCase()] ?? 0,
      l.kind === "scrap" ? "scrap" : "bullion"
    );
    const premium = band ?? l.own_premium;
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

  // declared_value IS the total, as specified for this surface. VERIFIED
  // against frontend/features/checkout/utils/getDeclaredValue.ts, and the two
  // differ in two ways worth naming: the frontend caps at $50,000 - FedEx's
  // declared-value ceiling, a shipping constraint that belongs where the
  // label is bought - and it prices from the cart line's own bid_premium
  // (?? 1 for scrap) where this prices from rates bands, the same divergence
  // D59 records for the client-side pricing family this replaces. A caller
  // insuring a shipment still owes FedEx Math.min(total, 50000).
  return {
    spots_at,
    items: quoted,
    total,
    declared_value: total,
    shipping_charge,
    payout_charge,
    // What the customer is actually paid. Never below zero: a small order whose
    // shipping and payout fee exceed it does not owe the business money, and a
    // negative headline above "Confirm and Place Order" is not a number anyone
    // should be shown.
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

// An EXISTING purchase order, priced - the order-drawer estimate the
// frontend's purchaseOrderTotal family computed client-side until this
// existed. Loaded through purchaseOrdersService.getById, the same repo-switch
// read GET get_purchase_orders serves the drawers from, so the items and
// premiums quoted are exactly the ones displayed. The route in front of this
// carries requireOwnOrder; nothing here re-checks ownership, and nothing in
// the body is read except the order id.
//
// WHICH SPOTS. Per metal: the order's OWN frozen bid (order_metals.bid_spot
// on its way out as `bid`, via getMetalsForOrder) when it is set, else the
// live pricing spot. That is
// the frontend rule this replaces - `orderSpot?.bid ?? globalSpot?.bid ?? 0`
// in every family member - and it is equivalent to how acceptOrder chooses
// (`order.spots_locked ? order_spots : spot_prices`), because lockSpots is
// what writes bid_spot into order_metals and unlockSpots/cancel clear it
// back to NULL: a non-null frozen bid IS the locked state, per metal. So a
// locked order estimates at its locked spots, an unlocked one at live, and
// an admin's per-metal update_spot override is honoured the way the drawer
// honoured it.
//
// STORED BEFORE ESTIMATE. item.price is the number the accept flow froze;
// where it is set it is returned verbatim and flagged "stored". Estimates
// mirror the drawers' own fallback chains EXACTLY so no displayed number
// shifts:
//   product: content * bid * (item.premium ?? product.bid_premium ?? 0)
//     (getPurchaseOrderBullionPrice), line_total = unit * (quantity ?? 1)
//   scrap:   content * bid * (item.premium ?? scrap.bid_premium ?? 1)
//     (getPurchaseOrderScrapPrice), content covers the whole line so
//     quantity does not multiply
// scrap_total and bullion_total are sums of those lines. The legacy
// purchaseOrderScrapTotal used `premium ?? 1` with NO bid_premium fallback,
// so its subtotal could disagree with its own lines when premium was null;
// the sum-of-lines here keeps the subtotal equal to what the rows show.
// Zero production scrap lines carry a null premium (see the header of
// pricing/bid.ts), so no live number moves.
//
// A metal with no spot anywhere prices at 0 rather than throwing - the
// stance of the display math this replaces (`?? 0` in every family member),
// NOT calculateTotalPrice's deliberate TypeError: this is a drawer estimate
// for an order that already exists, and the drawer must render. The accept
// path keeps its throw.
export async function orderQuote(body: Body): Promise<OrderQuote> {
  const order_id = body?.order_id;
  if (typeof order_id !== "string" || !UUID.test(order_id)) {
    throw badRequest("no order was named");
  }

  const order = (await purchaseOrdersService.getPurchaseById(order_id)) as
    | Record<string, any>
    | null
    | undefined;
  if (!order) {
    // requireOwnOrder answers 403 for a customer naming an order that is not
    // theirs or does not exist; only an admin (or a sales-order id, which the
    // guard also owns) reaches this.
    const err: HttpError = new Error("no such purchase order");
    err.statusCode = 404;
    throw err;
  }

  const [liveSpots, orderSpots] = await Promise.all([
    spotsService.getSpotPrices(),
    purchaseOrdersService.getPurchaseMetalsForOrder(order_id),
  ]);
  const spots_at = new Date().toISOString();

  // Exact-match on the metal name, the way the family and calculateTotalPrice
  // both find their spot rows.
  const bidFor = (metal: unknown): number => {
    const pinned = orderSpots.find((s) => s.name === metal)?.bid;
    if (pinned != null) return Number(pinned);
    return Number(liveSpots.find((s) => s.name === metal)?.bid ?? 0);
  };

  const rawItems: Body[] = Array.isArray(order.order_items) ? order.order_items : [];
  const items: OrderQuoteLine[] = [];
  let scrap_total = 0;
  let bullion_total = 0;

  for (const item of rawItems) {
    if (item?.item_type === "product") {
      const premium = Number(item.premium ?? item.product?.bid_premium ?? 0);
      const stored = item.price != null;
      const unit_price = stored
        ? Number(item.price)
        : Number(item.product?.content ?? 0) * (bidFor(item.product?.metal_type) * premium);
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

    if (item?.item_type === "scrap") {
      const premium = Number(item.premium ?? item.scrap?.bid_premium ?? 1);
      const stored = item.price != null;
      const unit_price = stored
        ? Number(item.price)
        : Number(item.scrap?.content ?? 0) * (bidFor(item.scrap?.metal) * premium);
      const line_total = unit_price;
      scrap_total += line_total;
      items.push({
        id: item.id,
        kind: "scrap",
        source: stored ? "stored" : "estimate",
        premium,
        unit_price,
        line_total,
      });
      continue;
    }

    // item_type 'unknown' - a line with neither foreign key. Skipped, which
    // is purchaseOrderTotal's fall-through: it never displayed and never
    // priced.
  }

  // The drawers' bottom line, purchaseOrderTotal's own expression: items
  // minus the shipping charge and the payout cost, both stored fields of the
  // order read above. `?? 0` where the frontend wrote `order.payout.cost`
  // bare - JS subtracts null as zero, and the exchange read builds payout
  // via jsonb_build_object so an orphaned order carries nulls, not a missing
  // object.
  const shipping = Number(order.shipment?.shipping_charge ?? 0);
  const payoutCost = Number(order.payout?.cost ?? 0);
  const total = scrap_total + bullion_total - shipping - payoutCost;

  return { order_id, spots_at, items, scrap_total, bullion_total, total };
}

// ------------------------------------------------------ profit breakdown

// THE LAST CLIENT MONEY MATH, PORTED (D83/D84). This is
// frontend/features/orders/purchaseOrders/utils/calculatePurchaseOrderTotals.ts
// moved server-side byte-for-byte - the shares algebra, the clamp, the
// renormalisation, the actual-content basis - because the numbers it produces
// are the business's margins and the frontend copy died with the orders wire
// conversion. The math is kept faithful rather than improved; anything that
// looks odd below looked exactly as odd in the file it came from, and changing
// what an admin has been reading is not a port's job.
//
// ADMIN ONLY, and that is a property of the DATA, not just the route: the
// split prices what the business and the refiner each make on a customer's
// order. The route carries requireAdmin and nothing here may be reachable any
// other way.
//
// Server-sourced throughout, per the header's rule: the order (the ADMIN
// read, because the assay actuals ride only on it), its frozen spots, the
// refiner's spots, and the rates bands. The body supplies the order id and
// nothing else - the replay test posts a poisoned body and pins that it
// changes nothing.

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
type ProfitSpot = { name?: string | null; bid?: number | null };
type ProfitItem = Record<string, any>;
type ProfitOrder = Record<string, any>;

const PROFIT_METALS: MetalName[] = ["Gold", "Silver", "Platinum", "Palladium"];
const toKey = (m: MetalName): MetalKey => m.toLowerCase() as MetalKey;

const emptyMetalsDict = (): ProfitMetalsDict => ({
  gold: { content: 0, percentage: 0, profit: 0 },
  silver: { content: 0, percentage: 0, profit: 0 },
  platinum: { content: 0, percentage: 0, profit: 0 },
  palladium: { content: 0, percentage: 0, profit: 0 },
});

const getItemMetal = (item: ProfitItem): MetalName | null => {
  if (item.item_type === "scrap") return (item.scrap?.metal ?? null) as MetalName | null;
  if (item.item_type === "product") return (item.product?.metal_type ?? null) as MetalName | null;
  return null;
};

// `item.product?.quantity` predates the wire: a product on an order item has
// never carried one, so the chain always lands on item.quantity. Ported as
// written rather than simplified, because this file's rule is byte-faithful.
const getItemContent = (item: ProfitItem): number => {
  if (item.item_type === "scrap") return item.scrap?.content ?? 0;
  if (item.item_type === "product") {
    const c = item.product?.content ?? 0;
    const q = item.product?.quantity ?? item.quantity ?? 1;
    return c * q;
  }
  return 0;
};

const getScrapActualContent = (item: ProfitItem): number | null => {
  if (item.item_type !== "scrap" || !item.scrap) return null;
  const s = item.scrap;
  if (typeof s.content_actual === "number") return s.content_actual;
  if (typeof s.post_melt_actual === "number" && typeof s.purity_actual === "number") {
    return s.post_melt_actual * s.purity_actual;
  }
  return null;
};

const getProfitSpot = (spots: ProfitSpot[], metal: MetalName): ProfitSpot | null =>
  spots.find((s) => String(s.name ?? "").toLowerCase() === metal.toLowerCase()) ?? null;

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
  item: ProfitItem,
  metal: MetalName,
  orderSpots: ProfitSpot[],
  refinerSpots: ProfitSpot[],
  category: "scrap" | "bullion" | "total",
  rates: Parameters<typeof getRatePct>[0],
  scrapTotalsByMetal: Record<string, number>
) {
  const orderSpot = getProfitSpot(orderSpots, metal);
  const refSpot = getProfitSpot(refinerSpots, metal);

  // For scrap, the default dorado premium comes from the rates table, tiered by
  // total scrap of this metal in the order. An explicit item.premium (admin
  // override) always wins.
  const ratePremium =
    item.item_type === "scrap"
      ? getRatePct(rates, metal, scrapTotalsByMetal[metal.toLowerCase()] ?? 0, "scrap")
      : undefined;

  const doradoPremium =
    item.premium != null ? Number(item.premium) : ratePremium ?? undefined;

  const refinerPremium =
    item.refiner_premium != null ? Number(item.refiner_premium) : undefined;

  const shares = premiumsToShares(category, doradoPremium, refinerPremium);
  return { ...shares, orderSpot, refSpot };
}

function computeMetalsForAllParties(
  order: ProfitOrder,
  category: "scrap" | "bullion" | "total",
  orderSpots: ProfitSpot[],
  refinerSpots: ProfitSpot[],
  rates: Parameters<typeof getRatePct>[0],
  scrapTotalsByMetal: Record<string, number>
) {
  const customer = emptyMetalsDict();
  const refiner = emptyMetalsDict();
  const dorado = emptyMetalsDict();

  for (const item of (order.order_items ?? []) as ProfitItem[]) {
    const metal = getItemMetal(item);
    if (!metal) continue;

    const isScrap = item.item_type === "scrap";
    const isBullion = item.item_type === "product";
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
      scrapTotalsByMetal
    );
    // doradoShare is derived and never read below - the dorado slice is what
    // remains after the other two, exactly as the frontend computed it.
    void doradoShare;

    const actualScrap = isScrap ? getScrapActualContent(item) : null;

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

function getShippingFees(order: ProfitOrder) {
  return {
    refiner: 0,
    dorado: order.shipping_fee_actual ?? 0,
    customer: order.shipment?.shipping_charge ?? 0,
  };
}

function getSpotNet(
  customerTotals: ProfitMetalsDict,
  orderSpots: ProfitSpot[],
  refinerSpots: ProfitSpot[]
) {
  let sum = 0;

  for (const metal of PROFIT_METALS) {
    const key = toKey(metal);
    const qty = customerTotals[key]?.content ?? 0;
    if (!qty) continue;

    const orderBid = getProfitSpot(orderSpots, metal)?.bid;
    const refBid = getProfitSpot(refinerSpots, metal)?.bid;
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

  // THE ADMIN READ, deliberately: the assay actuals (content_actual,
  // post_melt_actual, purity_actual) ride only on getAll's withActuals
  // projection, and the dorado/refiner content basis is computed from them.
  // getById is the customer read and omits them, which would silently price
  // the split off declared weights. This is what the admin drawer read too -
  // its order came from the admin list.
  const order = (await purchaseOrdersService.getAllPurchases()).find(
    (o) => (o as Record<string, unknown>).id === order_id
  ) as ProfitOrder | undefined;
  if (!order) {
    const err: HttpError = new Error("no such purchase order");
    err.statusCode = 404;
    throw err;
  }

  const [orderSpots, refinerSpots, rates] = await Promise.all([
    purchaseOrdersService.getPurchaseMetalsForOrder(order_id),
    purchaseOrdersService.getRefinerMetalsForOrder(order_id),
    ratesService.getAllRates(),
  ]);
  const spots_at = new Date().toISOString();

  // Total scrap content per metal for rate tiering (per-metal, order total).
  const scrapTotalsByMetal = sumContentByMetal(
    ((order.order_items ?? []) as ProfitItem[]).filter((i) => i.item_type === "scrap"),
    (i) => getItemMetal(i),
    (i) => getItemContent(i)
  );

  const scrap = computeMetalsForAllParties(order, "scrap", orderSpots, refinerSpots, rates, scrapTotalsByMetal);
  const bullion = computeMetalsForAllParties(order, "bullion", orderSpots, refinerSpots, rates, scrapTotalsByMetal);
  const total = computeMetalsForAllParties(order, "total", orderSpots, refinerSpots, rates, scrapTotalsByMetal);
  const shipping = getShippingFees(order);
  const spotNet = getSpotNet(total.customer, orderSpots, refinerSpots);

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
      refiner_fee_net: -Math.abs(Number(order.payout?.cost ?? 0)),
      spot_net: spotNet.customer,
      total_profit: getTotalProfit(total.customer, shipping.customer, spotNet.customer, order.payout?.cost),
    },
  };
}
