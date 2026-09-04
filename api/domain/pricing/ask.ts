import type { OrderPrices, PricingSpot, Spots } from "@dorado/contracts";
export type { OrderPrices, PricingSpot, Spots } from "@dorado/contracts";

export function calculateItemAsk(
  item: {
    metal_type?: string | null;
    content?: number | null;
    ask_premium?: number | null;
    quantity?: number | null;
  },
  spots: Spots
): number {
  const spot = spots?.find((s: PricingSpot) => s.name === item.metal_type);
  return (
    (item?.content ?? 0) * ((spot?.ask ?? 0) * (item?.ask_premium ?? 0))
  );
}

export function calculateCardCharge(
  order_total: number,
  payment_method: string | null | undefined
): number {
  if (payment_method === "ACH") {
    return order_total * 0.005;
  } else {
    return order_total * 0.029;
  }
}

export function calculateItemTotals(
  items: {
    metal_type?: string | null;
    content?: number | null;
    ask_premium?: number | null;
    quantity?: number | null;
  }[],
  spots: Spots
): number {
  const baseTotal = items.reduce((acc, item) => {
    const price = calculateItemAsk(item, spots);

    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);

  return baseTotal;
}

export function getShippingCharge(
  item_total: number,
  shipping_service: string | null | undefined
): number {
  return item_total > 1000
    ? 0
    : shipping_service === "OVERNIGHT"
    ? 50
    : shipping_service === "STANDARD"
    ? 25
    : 0;
}

export function calculateSalesTax(
  items: ({
    metal_type?: string | null;
    content?: number | null;
    ask_premium?: number | null;
    quantity?: number | null;
  } & { sales_tax_rate: number })[],
  spots: Spots
): number {
  return items.reduce((acc, item) => {
    return (
      acc + calculateItemAsk(item, spots) * item.quantity! * item.sales_tax_rate
    );
  }, 0);
}

export function calculateSalesOrderTotal(
  items: ({
    metal_type?: string | null;
    content?: number | null;
    ask_premium?: number | null;
    quantity?: number | null;
  } & { sales_tax_rate: number })[],
  spots: Spots,
  user: { dorado_funds?: number | null },
  shipping_service: string | null | undefined,
  payment_method: string | null | undefined
): OrderPrices {
  const item_total = calculateItemTotals(items, spots);
  const shipping_charge = getShippingCharge(item_total, shipping_service);
  const sales_tax = calculateSalesTax(items, spots);

  const base_total = item_total + shipping_charge + sales_tax;

  const beginning_funds = user.dorado_funds ?? 0;
  let appliedFunds = Math.min(beginning_funds, base_total);

  const STRIPE_MINIMUM_CHARGE = 0.5;
  const cardRemainder = base_total - appliedFunds;
  if (cardRemainder > 0 && cardRemainder < STRIPE_MINIMUM_CHARGE) {
    appliedFunds = Math.max(0, base_total - STRIPE_MINIMUM_CHARGE);
  }
  const ending_funds = beginning_funds - appliedFunds;

  const pre_charges_amount = appliedFunds;
  const subject_to_charges_amount = base_total - appliedFunds;

  let post_charges_amount = subject_to_charges_amount;
  let charges_amount = 0;
  if (subject_to_charges_amount > 0) {
    charges_amount = calculateCardCharge(
      subject_to_charges_amount,
      payment_method
    );
    post_charges_amount += charges_amount;
  }

  const order_total = pre_charges_amount + post_charges_amount;
  return {
    item_total,
    base_total,
    shipping_charge,
    beginning_funds,
    ending_funds,
    pre_charges_amount,
    subject_to_charges_amount,
    post_charges_amount,
    charges_amount,
    sales_tax,
    order_total,
  };
}
