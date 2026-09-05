import * as productService from "#domain/products/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as taxService from "#domain/sales-tax/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as ratesService from "#domain/rates/service.ts";
import * as servicesService from "#domain/shipping/services/service.ts";
import * as methodsRepo from "#db/payments/methods/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as orderSpotsService from "#domain/orders/spots/service.ts";
import * as orderRules from "#domain/orders/rules.ts";
import * as usersService from "#domain/users/service.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as shippingLabels from "#domain/shipping/labels.ts";
import { paymentSurface } from "#domain/payments/rules.ts";
import { payoutFee, PAYOUT_METHOD_FEES } from "#domain/payments/details/constants.ts";
import { bidPrice, estimatedPayout, requireMetalName } from "#domain/quotes/rules.ts";
import * as rules from "#domain/quotes/rules.ts";
import { calculateItemAsk, calculateSalesOrderTotal } from "#domain/pricing/service.ts";
import { effectivePayoutFee, inboundShipment } from "#domain/pricing/service.ts";
import type {
  CatalogQuote, CatalogQuoteBody, CheckoutItem, Direction, OrderPrices, OrderQuote,
  OrderQuoteBody, OrderQuoteLine, PricedLine, PricingSpot, PurchaseOrderQuote,
  PurchaseOrderQuoteLine, SalesOrderQuote, SalesOrderQuoteLine, TaxedSaleLine,
} from "@dorado/contracts";

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

async function payoutChargeFor(payout_method_id: string | null | undefined): Promise<number> {
  if (!payout_method_id) return 0;
  const method = await methodsRepo.getOne(payout_method_id);
  const fee = method ? payoutFee(method.type) : null;
  rules.assertPayoutFee(fee, Object.keys(PAYOUT_METHOD_FEES));
  return fee;
}

async function pricePurchaseCheckout(subject_user_id: string): Promise<PurchaseOrderQuote> {
  const checkout = await checkoutService.getRowFor(subject_user_id, "purchase");
  const cart = await checkoutService.listItems(subject_user_id, "purchase");

  const spots = await spotsService.getSpotPrices();
  const spots_at = new Date().toISOString();
  const metalNames = await metalsRepo.namesById();
  const rates = await ratesService.listRates();

  const metalOf = (item: CheckoutItem): string =>
    requireMetalName(item.metal_id ? metalNames.get(item.metal_id) : undefined, item.id);

  const pricedLines: PricedLine[] = cart.map((item) => ({
    id: item.id, content: item.content, quantity: item.quantity,
    bullion_id: item.bullion_id, metal: metalOf(item),
  }));
  const retiered = new Map(
    orderRules.retierPlan(rates, pricedLines).map((p) => [p.id, p.premium])
  );

  const quoted: PurchaseOrderQuoteLine[] = cart.map((item) => {
    const kind: "product" | "scrap" = item.bullion_id === null ? "scrap" : "product";
    const metal = metalOf(item);
    const content = Number(item.content ?? 0);
    const premium = Number(retiered.get(item.id) ?? item.premium ?? 0);
    const unit_price = bidPrice(content, premium, metal, spots);
    return {
      id: item.id, kind, metal, content, premium, unit_price,
      line_total: kind === "product" ? unit_price * Number(item.quantity ?? 1) : unit_price,
    };
  });

  const total = quoted.reduce((acc, line) => acc + line.line_total, 0);
  const payout_charge = await payoutChargeFor(checkout.payment_method_id);
  const shipping_charge = 0;
  const declared_value = Math.min(total, await servicesService.insuranceCeiling());

  return {
    spots_at, items: quoted, total, declared_value,
    shipping_charge, payout_charge,
    estimated_payout: estimatedPayout(total, shipping_charge, payout_charge),
  };
}

export async function priceSaleCheckout(user_id: string): Promise<{
  cart: CheckoutItem[]; lines: TaxedSaleLine[]; prices: OrderPrices; spots: PricingSpot[];
}> {
  const checkout = await checkoutService.getRowFor(user_id, "sale");
  const cart = await checkoutService.listItems(user_id, "sale");

  const balance = await usersService.getBalance(user_id);
  rules.assertBalance(balance);
  const dorado_funds = balance == null ? 0 : Number(balance);

  const address = checkout.recipient_address_id
    ? await addressService.getAddressFromId(checkout.recipient_address_id)
    : undefined;
  const service = checkout.fulfillment_id
    ? await shippingLabels.serviceForFulfillment(checkout.fulfillment_id)
    : undefined;
  const method = checkout.payment_method_id
    ? await methodsRepo.getOne(checkout.payment_method_id)
    : undefined;

  const spots = await spotsService.getSpotPrices();
  const metalNames = await metalsRepo.namesById();
  const catalogue = await productService.getItemsFromServer(orderRules.catalogueWanted(cart));
  const lines = await taxService.attachSalesTaxToItems(
    address?.state ?? null,
    orderRules.saleLines(cart, catalogue, metalNames),
    spots
  );
  const prices = calculateSalesOrderTotal(
    lines, spots, { dorado_funds }, service?.code, method?.type
  );

  return { cart, lines, prices, spots };
}

async function priceSaleQuote(subject_user_id: string): Promise<SalesOrderQuote> {
  const { cart, lines, prices, spots } = await priceSaleCheckout(subject_user_id);
  const spots_at = new Date().toISOString();

  const items: SalesOrderQuoteLine[] = cart.map((item, index) => {
    const sold = lines[index]!;
    const unit_ask = calculateItemAsk(sold, spots);
    const quantity = Number(item.quantity ?? 1);
    return {
      id: item.id, quantity, unit_ask,
      line_total: unit_ask * quantity,
      sales_tax_rate: sold.sales_tax_rate,
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
    items,
  };
}

export async function checkoutQuote(
  subject_user_id: string, direction: "sale"
): Promise<SalesOrderQuote>;
export async function checkoutQuote(
  subject_user_id: string, direction: "purchase"
): Promise<PurchaseOrderQuote>;
export async function checkoutQuote(
  subject_user_id: string, direction: Direction
): Promise<PurchaseOrderQuote | SalesOrderQuote>;
export async function checkoutQuote(
  subject_user_id: string, direction: Direction
): Promise<PurchaseOrderQuote | SalesOrderQuote> {
  return direction === "sale"
    ? await priceSaleQuote(subject_user_id)
    : await pricePurchaseCheckout(subject_user_id);
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
