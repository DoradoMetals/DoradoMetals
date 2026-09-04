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
import { paymentSurface } from "#domain/payments/rules.ts";
import { payoutFee, PAYOUT_METHOD_FEES } from "#domain/payouts/constants.ts";
import {
  bandableContent, bidPrice, declaredContent, estimatedPayout,
  requireBandPremium, requireSpot,
} from "#domain/quotes/rules.ts";
import * as rules from "#domain/quotes/rules.ts";
import { calculateItemAsk, calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import { effectivePayoutFee, inboundShipment } from "#domain/pricing/service.ts";
import { sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import type { CatalogQuote, CatalogQuoteBody, OrderQuote, OrderQuoteBody, OrderQuoteLine, PurchaseOrderQuote, PurchaseOrderQuoteBody, PurchaseOrderQuoteLine, SalesOrderQuote, SalesOrderQuoteBody } from "@dorado/contracts";

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
  rules.assertProductsAreLive(unique.filter((id) => !live.has(id)));
}

export async function catalogQuote({ side, items }: CatalogQuoteBody): Promise<CatalogQuote> {
  await refuseProductsThatAreNotLive(items.map((line) => line.id), side);

  const rows = await productService.getItemsFromServer(
    items.map((line) => ({ id: line.id, quantity: line.quantity ?? 1 }))
  );
  const spots = await spotsService.getSpotPrices();
  const spots_at = new Date().toISOString();
  const byId = new Map(rows.map((row) => [row.id, row]));

  const quoted = items.map(({ id, quantity = 1 }) => {
    const row = byId.get(id);
    rules.assertProduct(row);
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

export async function salesOrderQuote(
  subject_user_id: string,
  { items, address_id, carrier_service_id, payment_method_id }: SalesOrderQuoteBody
): Promise<SalesOrderQuote> {
  const balance = await usersService.getBalance(subject_user_id);
  rules.assertBalance(balance);
  const dorado_funds = balance == null ? 0 : Number(balance);

  const address = address_id ? await addressService.getAddressFromId(address_id) : undefined;
  if (address_id) rules.assertAddress(address, address_id);

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

  const prices = calculateSalesOrderTotal(
    withTax, spots, { dorado_funds }, service?.code, method?.type
  );

  const lines = withTax.map((item) => {
    const unit_ask = calculateItemAsk(item, spots);
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
    payment_surface: paymentSurface(prices.post_charges_amount),
    items: lines,
  };
}

type PricedPurchaseLine =
  Pick<PurchaseOrderQuoteLine, "index" | "kind" | "metal" | "content"> & { quantity: number };

export async function purchaseOrderQuote(
  { items, payout_method_id, shipping_charge }: PurchaseOrderQuoteBody
): Promise<PurchaseOrderQuote> {
  const payout_charge = await payoutChargeFor(payout_method_id);
  const carriage = shipping_charge ?? 0;

  const productIds = items.flatMap(
    (line) => (line.type === "product" ? [line.bullion_id] : [])
  );
  await refuseProductsThatAreNotLive(productIds, "bid");

  const rows = await productService.getItemsFromServer(
    Array.from(new Set(productIds)).map((id) => ({ id, quantity: 0 }))
  );
  const spots = await spotsService.getSpotPrices();
  const rates = await ratesService.listRates();
  const spots_at = new Date().toISOString();
  const byId = new Map(rows.map((row) => [row.id, row]));

  const lines: PricedPurchaseLine[] = items.map((line, index) => {
    if (line.type === "product") {
      const row = byId.get(line.bullion_id);
      rules.assertProduct(row);
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
      line_total: line.kind === "product" ? unit_price * line.quantity : unit_price,
    };
  });

  const total = quoted.reduce((acc, line) => acc + line.line_total, 0);

  const declared_value = Math.min(total, await servicesService.insuranceCeiling());

  return {
    spots_at, items: quoted, total, declared_value,
    shipping_charge: carriage, payout_charge,
    estimated_payout: estimatedPayout(total, carriage, payout_charge),
  };
}

async function payoutChargeFor(payout_method_id: string | null | undefined): Promise<number> {
  if (!payout_method_id) return 0;
  const method = await methodsRepo.getOne(payout_method_id);
  const fee = method ? payoutFee(method.type) : null;
  rules.assertPayoutFee(fee, Object.keys(PAYOUT_METHOD_FEES));
  return fee;
}

export async function orderQuote({ order_id }: OrderQuoteBody): Promise<OrderQuote> {
  const order = await orderRead.view(order_id);
  rules.assertOrder(order);

  const liveSpots = await spotsService.getSpotPrices();
  const frozenSpots = await orderSpotsService.rowsFor(order_id);
  const spots_at = new Date().toISOString();

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
      const premium = Number(item.premium ?? 0);
      const unit_price = stored
        ? Number(item.price)
        : Number(item.content ?? 0) * (bidFor(item.metal_id) * premium);
      const line_total = unit_price * Number(item.quantity ?? 1);
      bullion_total += line_total;
      items.push({
        id: item.id, kind: "product", source: stored ? "stored" : "estimate",
        premium, unit_price, line_total,
      });
      continue;
    }

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

  const shipping = Number(inboundShipment(order)?.cost ?? 0);
  const total = scrap_total + bullion_total - shipping - effectivePayoutFee(order);

  return { order_id, spots_at, items, scrap_total, bullion_total, total };
}
