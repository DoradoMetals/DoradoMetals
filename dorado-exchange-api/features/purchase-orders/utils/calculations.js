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
