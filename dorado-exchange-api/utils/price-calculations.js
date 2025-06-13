function calculateTotalPrice(order, spots) {
  const baseTotal = order.order_items.reduce((acc, item) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s) => s.type === item.product?.metal_type);

      const price =
        item.price ??
        (item?.product?.content ?? 0) *
          (spot.bid_spot *
            (item.bullion_premium ?? item?.product?.bid_premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s) => s.type === item.scrap?.metal);

      const price =
        item.price ??
        (item?.scrap?.content ?? 0) * (spot.bid_spot * spot.scrap_percentage);
      return acc + price;
    }

    return acc;
  }, 0);

  const shipping = order.shipment?.shipping_charge ?? 0;

  let payoutFee = 0;
  if (order.payout.method === "WIRE") {
    payoutFee = 20;
  }

  return baseTotal - shipping - payoutFee;
}

function calculateReturnDeclaredValue(order, spots) {
  const total = order.order_items.reduce((acc, item) => {
    if (item.item_type === "product") {
      const spot = spots?.find((s) => s.type === item.product?.metal_type);

      const price =
        (item?.product?.content ?? 0) *
        (spot.bid_spot *
          (item.bullion_premium ?? item?.product?.bid_premium ?? 0));

      const quantity = item.quantity ?? 1;
      return acc + price * quantity;
    }

    if (item.item_type === "scrap") {
      const spot = spots?.find((s) => s.type === item.scrap?.metal);

      const price =
        (item?.scrap?.content ?? 0) * (spot.bid_spot * spot.scrap_percentage);
      return acc + price;
    }

    return acc;
  }, 0);

  return total;
}

function calculateItemPrice(item, spots) {
  if (item.item_type === "product") {
    const spot = spots?.find((s) => s.type === item.product?.metal_type);
    return (
      item.price ??
      (item?.product.content ?? 0) *
        (spot.bid_spot *
          (item.bullion_premium ?? item?.product.bid_premium ?? 0))
    );
  } else if (item.item_type === "scrap") {
    const spot = spots?.find((s) => s.type === item.scrap?.metal);
    return (
      item.price ??
      (item?.scrap.content ?? 0) * (spot.bid_spot * spot.scrap_percentage)
    );
  }
}

function getBullionTotal(items, spots) {
  return items.reduce((acc, item) => {
    const spot = spots?.find((s) => s.type === item.product?.metal_type);
    const price =
      item.price ??
      (item?.product?.content ?? 0) *
        (spot.bid_spot *
          (item.bullion_premium ?? item?.product?.bid_premium ?? 0));
    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);
}

function getScrapTotal(items, spots) {
  return items.reduce((acc, item) => {
    const spot = spots?.find((s) => s.type === item.scrap?.metal);
    const price =
      item.price ??
      (item?.scrap?.content ?? 0) * (spot.bid_spot * spot.scrap_percentage);
    return acc + price;
  }, 0);
}

//sales orders
function calculateItemAsk(item, spots, payment_method) {
  const spot = spots?.find((s) => s.type === item.metal_type);
  return (
    (item?.content ?? 0) * ((spot?.ask_spot ?? 0) * (item?.ask_premium ?? 0))
  );
}

function calculateCardCharge(order_total) {
  return order_total * 0.029;
}

function calculateItemTotals(items, spots) {
  const baseTotal = items.reduce((acc, item) => {
    const spot = spots?.find((s) => s.type === item.metal_type);

    const price =
      (item?.content ?? 0) * ((spot?.ask_spot ?? 0) * (item?.ask_premium ?? 0));

    const quantity = item.quantity ?? 1;
    return acc + price * quantity;
  }, 0);

  return baseTotal;
}

function getShippingCharge(item_total, shipping_service) {
  return item_total > 1000 ? 0 : shipping_service === "OVERNIGHT" ? 50 : 25;
}

function calculateSalesOrderTotal(
  items,
  using_funds,
  spots,
  user,
  shipping_service,
  payment_method
) {
  const item_total = calculateItemTotals(items, spots);
  const shipping_charge = getShippingCharge(item_total, shipping_service);
  const base_total = item_total + shipping_charge;

  const beginning_funds = user.dorado_funds ?? 0;
  const appliedFunds = using_funds ? Math.min(beginning_funds, base_total) : 0;
  const ending_funds = beginning_funds - appliedFunds;

  const pre_charges_amount = appliedFunds;
  const subject_to_charges_amount = base_total - appliedFunds;

  let post_charges_amount = subject_to_charges_amount;
  if (payment_method !== "FUNDS") {
    const card_fee = calculateCardCharge(subject_to_charges_amount);
    post_charges_amount += card_fee;
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
    order_total,
  };
}

module.exports = {
  calculateTotalPrice,
  calculateReturnDeclaredValue,
  calculateItemPrice,
  getBullionTotal,
  getScrapTotal,
  calculateItemAsk,
  calculateSalesOrderTotal,
};
