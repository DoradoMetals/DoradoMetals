// THE PROFIT SPLIT ON ONE PURCHASE ORDER - what the business, the refinery and
// the customer each make on it.
//
// ADMIN ONLY as a property of the DATA, not just the route.
//
// PORTED BYTE-FOR-BYTE from the frontend's own calculatePurchaseOrderTotals
// (the numbers are the business's margins, and the frontend copy died with the
// orders wire conversion) - kept faithful rather than improved; anything that
// looks odd here looked exactly as odd in the original.
//
// Server-sourced throughout: the order, its frozen spots, the refiner's spots
// and the rate bands. The body supplies only the order id, and a replay test
// pins that a poisoned body changes nothing.
//
// ITS OWN FILE (D214 item 11): a use case gets one when it outgrows a screen,
// and this is three hundred lines of arithmetic beside four quote reads.
import * as ratesService from "#domain/rates/service.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";
import * as refinerSpotsService from "#domain/refiners/spots/service.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import { effectivePayoutFee, inboundShipment, recordedContent } from "#domain/pricing/service.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { NotFound } from "#shared/errors.ts";
import type { OrderQuoteBody, OrderView, OrderViewItem, ProfitBreakdown, ProfitMetalsDict } from "@dorado/contracts";
import type { RefinerItemRow } from "#db/refiners/items/repo.ts";


// metal_id -> the metal's name, and order_item_id -> what the refinery
// reported. Two lookups the COMPOSED order used to smear onto every line
// (`scrap.metal`, `scrap.content_actual`, `item.refiner_premium`); the composer
// died with D214 item 12 and they are reads of their own tables now.
type MetalNames = ReadonlyMap<string, string>;
type AssayRows = ReadonlyMap<string, RefinerItemRow>;

type ProfitMetalName = "Gold" | "Silver" | "Platinum" | "Palladium";
type MetalKey = "gold" | "silver" | "platinum" | "palladium";
// The spot as this math reads it - the metal it prices and the bid.
type ProfitSpot = { metal_id: string; bid: number | null };

const PROFIT_METALS: ProfitMetalName[] = ["Gold", "Silver", "Platinum", "Palladium"];

// The four the split is reported for. A metal outside them has no slot in the
// dictionary, so a line naming one is skipped rather than cast into a key that
// does not exist.
const KEY_OF: Readonly<Record<ProfitMetalName, MetalKey>> = {
  Gold: "gold", Silver: "silver", Platinum: "platinum", Palladium: "palladium",
};
const toKey = (m: ProfitMetalName): MetalKey => KEY_OF[m];
const isProfitMetal = (name: string | undefined): name is ProfitMetalName =>
  name !== undefined && name in KEY_OF;

const emptyMetalsDict = (): ProfitMetalsDict => ({
  gold: { content: 0, percentage: 0, profit: 0 },
  silver: { content: 0, percentage: 0, profit: 0 },
  platinum: { content: 0, percentage: 0, profit: 0 },
  palladium: { content: 0, percentage: 0, profit: 0 },
});

const getItemMetal = (item: OrderViewItem, metals: MetalNames): ProfitMetalName | null => {
  const name = metals.get(item.metal_id);
  return isProfitMetal(name) ? name : null;
};

// A scrap line's content covers the whole lot; a bullion line's is per coin.
const getItemContent = (item: OrderViewItem): number => {
  if (item.bullion_id === null) return item.content ?? 0;
  return Number(recordedContent(item) ?? 0) * Number(item.quantity ?? 1);
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
  metal: ProfitMetalName,
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
  const idOf = new Map(Array.from(metals, ([id, name]) => [name.toLowerCase(), id]));

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

export async function profitBreakdown({ order_id }: OrderQuoteBody): Promise<ProfitBreakdown> {
  // ONE ORDER, READ BY ID. It used to read EVERY purchase order and find this
  // one in the array, because the assay actuals rode only on the admin list's
  // projection. They are refiners.items rows now, read below by the same id.
  const order = await orderRead.view(order_id);
  if (!order) throw new NotFound("no such purchase order");

  // Sequential, not Promise.all: none of these five calls takes a client of
  // its own, so they default to the shared pool - genuinely concurrent when
  // unpinned, but the same client under a pinned test transaction. See
  // domain/products/compose.ts's labels() for the fuller version of this
  // note.
  const frozenSpots = await orderSpotsService.rowsFor(order_id);
  const refinerNamed = await refinerSpotsService.namedFor(order_id);
  const rates = await ratesService.listRates();
  const metals = await metalsRepo.namesById();
  const assayRows = await refinerItemsRepo.getForOrder(order_id);
  const spots_at = new Date().toISOString();

  // Both spot sets keyed by the metal they price. The refiner's are named
  // rather than keyed, so the name is resolved back to its id once.
  const idOfMetal = new Map(Array.from(metals, ([id, name]) => [name.toLowerCase(), id]));
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
