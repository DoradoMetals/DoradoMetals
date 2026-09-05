import * as ratesService from "#domain/rates/service.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";
import * as refinerSpotsService from "#domain/refiners/spots/service.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import { effectivePayoutFee, inboundShipment, recordedContent } from "#domain/pricing/service.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import * as rules from "#domain/quotes/rules.ts";
import type {
  OrderQuoteBody, OrderSpot, OrderView, OrderViewItem, ProfitBreakdown, ProfitMetalsDict,
  RefinerItem,
} from "@dorado/contracts";

const PROFIT_METALS = ["Gold", "Silver", "Platinum", "Palladium"] as const;

const KEY_OF: Readonly<Record<(typeof PROFIT_METALS)[number], keyof ProfitMetalsDict>> = {
  Gold: "gold", Silver: "silver", Platinum: "platinum", Palladium: "palladium",
};
const toKey = (m: (typeof PROFIT_METALS)[number]): keyof ProfitMetalsDict => KEY_OF[m];
const isProfitMetal = (name: string | undefined): name is (typeof PROFIT_METALS)[number] =>
  name !== undefined && name in KEY_OF;

const emptyMetalsDict = (): ProfitMetalsDict => ({
  gold: { content: 0, percentage: 0, profit: 0 },
  silver: { content: 0, percentage: 0, profit: 0 },
  platinum: { content: 0, percentage: 0, profit: 0 },
  palladium: { content: 0, percentage: 0, profit: 0 },
});

const getItemMetal = (
  item: OrderViewItem, metals: ReadonlyMap<string, string>
): (typeof PROFIT_METALS)[number] | null => {
  const name = metals.get(item.metal_id);
  return isProfitMetal(name) ? name : null;
};

const getItemContent = (item: OrderViewItem): number => {
  if (item.bullion_id === null) return item.content ?? 0;
  return Number(recordedContent(item) ?? 0) * Number(item.quantity ?? 1);
};

const getScrapActualContent = (
  item: OrderViewItem, assay: ReadonlyMap<string, RefinerItem>
): number | null => {
  if (item.bullion_id !== null) return null;
  const reported = assay.get(item.id);
  if (!reported) return null;
  if (typeof reported.content === "number") return reported.content;
  if (typeof reported.post_melt === "number" && typeof reported.purity === "number") {
    return reported.post_melt * reported.purity;
  }
  return null;
};

const getProfitSpot = (
  spots: { metal_id: string; bid: number | null }[], metal_id: string
): { metal_id: string; bid: number | null } | null =>
  spots.find((s) => s.metal_id === metal_id) ?? null;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function premiumsToShares(
  category: "scrap" | "bullion" | "total",
  doradoPremium?: number | null,
  refinerPremium?: number | null
): { customerShare: number; doradoShare: number; refinerShare: number } {
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
  metal: (typeof PROFIT_METALS)[number],
  orderSpots: Pick<OrderSpot, "metal_id" | "bid">[],
  refinerSpots: Pick<OrderSpot, "metal_id" | "bid">[],
  category: "scrap" | "bullion" | "total",
  rates: Parameters<typeof getRatePct>[0],
  scrapTotalsByMetal: Record<string, number>,
  assay: ReadonlyMap<string, RefinerItem>
) {
  const orderSpot = getProfitSpot(orderSpots, item.metal_id);
  const refSpot = getProfitSpot(refinerSpots, item.metal_id);

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
  orderSpots: Pick<OrderSpot, "metal_id" | "bid">[],
  refinerSpots: Pick<OrderSpot, "metal_id" | "bid">[],
  rates: Parameters<typeof getRatePct>[0],
  scrapTotalsByMetal: Record<string, number>,
  metals: ReadonlyMap<string, string>,
  assay: ReadonlyMap<string, RefinerItem>
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
  orderSpots: Pick<OrderSpot, "metal_id" | "bid">[],
  refinerSpots: Pick<OrderSpot, "metal_id" | "bid">[],
  metals: ReadonlyMap<string, string>
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
  const order = await orderRead.view(order_id);
  rules.assertOrder(order);

  const frozenSpots = await orderSpotsService.rowsFor(order_id);
  const refinerNamed = await refinerSpotsService.namedFor(order_id);
  const rates = await ratesService.listRates();
  const metals = await metalsRepo.namesById();
  const assayRows = await refinerItemsRepo.getForOrder(order_id);
  const spots_at = new Date().toISOString();

  const idOfMetal = new Map(Array.from(metals, ([id, name]) => [name.toLowerCase(), id]));
  const orderSpots: { metal_id: string; bid: number | null }[] =
    frozenSpots.map((s) => ({ metal_id: s.metal_id, bid: s.bid }));
  const refinerSpots: { metal_id: string; bid: number | null }[] = refinerNamed.flatMap((s) => {
    const metal_id = idOfMetal.get(String(s.name ?? "").toLowerCase());
    return metal_id ? [{ metal_id, bid: s.bid }] : [];
  });
  const assay: ReadonlyMap<string, RefinerItem> = new Map(assayRows.map((r) => [r.order_item_id, r]));

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
