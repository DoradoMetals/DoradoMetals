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
// never prices and never spots. getPricingSpots' header holds the measurement
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
import {
  calculateItemAsk,
  calculateSalesOrderTotal,
  type OrderPrices,
} from "#features/sales-orders/utils/calculations.ts";
import { getRatePct, sumContentByMetal } from "#features/rates/utils/resolveRate.ts";
import query from "#shared/db/query.js";
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import type { SpotPriceWire } from "@dorado/contracts";

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
// import for it: calculateTotalPrice (purchase-orders/utils/calculations.ts)
// prices SAVED order lines - it honours a frozen item.price and deliberately
// throws on a missing spot - and the frontend's getProductBidPrice is exactly
// what this surface exists to replace. Same expression as the ask, same ?? 0
// stance: the two sides of one quote should fail the same way, and
// calculateItemAsk prices a missing spot at zero rather than throwing.
function calculateItemBid(
  item: { metal_type?: string | null; content?: number | null; bid_premium?: number | null },
  spots: SpotPriceWire[]
): number {
  const spot = spots.find((s) => s.type === item.metal_type);
  return (item?.content ?? 0) * ((spot?.bid_spot ?? 0) * (item?.bid_premium ?? 0));
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
    spotsService.getPricingSpots(),
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

  // THE FUNDS COME FROM THE SESSION USER'S ROW, NEVER THE BODY. The create
  // path reads session.user.dorado_funds - better-auth's serving of the same
  // column, declared as an additionalField in auth/client.ts. The quote reads
  // the row itself: usersService.getUser deliberately projects no balance
  // (users/sql/get_one.sql - "preserved rather than harmonised"), and
  // exchange.users is the table removeFunds writes, so it is the balance an
  // order placed after this quote would actually apply. Read the way the
  // order read.services read their user rows. A caller declaring their own
  // balance would be declaring their own discount.
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
  const spots = await spotsService.getPricingSpots();
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
export async function purchaseOrderQuote(body: Body): Promise<PurchaseOrderQuote> {
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length === 0) throw badRequest("a quote needs at least one item");

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
    spotsService.getPricingSpots(),
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
      (s) => String(s.type).toLowerCase() === l.metal.toLowerCase()
    );
    if (!spot) throw badRequest(`item ${l.index} names a metal with no spot price`);
    return {
      index: l.index,
      kind: l.kind,
      metal: String(spot.type),
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
  return { spots_at, items: quoted, total, declared_value: total };
}
