export function calculateTotalPrice(order, spots) {
  const baseTotal = order.order_items.reduce((acc, item) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s) => s.type === item.product?.metal_type);

      const price =
        item.price ??
        (item?.product?.content ?? 0) *
          (spot.bid_spot *
            (item.premium ?? item?.product?.bid_premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s) => s.type === item.scrap?.metal);

      const price =
        item.price ??
        (item?.scrap?.content ?? 0) * (spot.bid_spot * item.premium);
      return acc + price;
    }

    return acc;
  }, 0);

  const shipping = order.shipment?.shipping_charge ?? 0;

  return baseTotal - shipping - order.payout.cost;
}

export function calculateReturnDeclaredValue(order, spots) {
  const total = order.order_items.reduce((acc, item) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s) => s.type === item.product?.metal_type);

      const price =
        (item?.product?.content ?? 0) *
        (spot.bid_spot *
          (item.premium ?? item?.product?.bid_premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s) => s.type === item.scrap?.metal);

      const price =
        (item?.scrap?.content ?? 0) * (spot.bid_spot * item.premium);
      return acc + price;
    }

    return acc;
  }, 0);

  return total;
}

export function calculateItemPrice(item, spots) {
  if (item.item_type === "product") {
    const spot = spots?.find((s) => s.type === item.product?.metal_type);
    return (
      item.price ??
      (item?.product.content ?? 0) *
        (spot.bid_spot *
          (item.premium ?? item?.product.bid_premium ?? 0))
    );
  } else if (item.item_type === "scrap") {
    const spot = spots?.find((s) => s.type === item.scrap?.metal);
    return (
      item.price ??
      (item?.scrap.content ?? 0) * (spot.bid_spot * item.premium)
    );
  }
}

export function getBullionTotal(items, spots) {
  return items.reduce((acc, item) => {
    const spot = spots?.find((s) => s.type === item.product?.metal_type);
    const price =
      item.price ??
      (item?.product?.content ?? 0) *
        (spot.bid_spot *
          (item.premium ?? item?.product?.bid_premium ?? 0));
    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);
}

export function getScrapTotal(items, spots) {
  return items.reduce((acc, item) => {
    const spot = spots?.find((s) => s.type === item.scrap?.metal);
    const price =
      item.price ??
      (item?.scrap?.content ?? 0) * (spot.bid_spot * item.premium);
    return acc + price;
  }, 0);
}

//sales orders
export function calculateItemAsk(item, spots) {
  const spot = spots?.find((s) => s.type === item.metal_type);
  return (
    (item?.content ?? 0) * ((spot?.ask_spot ?? 0) * (item?.ask_premium ?? 0))
  );
}

export function calculateCardCharge(order_total, payment_method) {
  if (payment_method === "ACH") {
    return order_total * 0.005;
  } else {
    return order_total * 0.029;
  }
}

export function calculateItemTotals(items, spots) {
  const baseTotal = items.reduce((acc, item) => {
    const spot = spots?.find((s) => s.type === item.metal_type);

    const price =
      (item?.content ?? 0) * ((spot?.ask_spot ?? 0) * (item?.ask_premium ?? 0));

    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);

  return baseTotal;
}

export function getShippingCharge(item_total, shipping_service) {
  return item_total > 1000
    ? 0
    : shipping_service === "OVERNIGHT"
    ? 50
    : shipping_service === "STANDARD"
    ? 25
    : 0;
}

export function calculateSalesTax(items, spots) {
  return items.reduce((acc, item) => {
    return (
      acc + calculateItemAsk(item, spots) * item.quantity * item.sales_tax_rate
    );
  }, 0);
}

export function calculateSalesOrderTotal(
  items,
  using_funds,
  spots,
  user,
  shipping_service,
  payment_method
) {
  const item_total = calculateItemTotals(items, spots);
  const shipping_charge = getShippingCharge(item_total, shipping_service);
  const sales_tax = calculateSalesTax(items, spots);

  const base_total = item_total + shipping_charge + sales_tax;

  const beginning_funds = user.dorado_funds ?? 0;
  const appliedFunds = using_funds ? Math.min(beginning_funds, base_total) : 0;
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
