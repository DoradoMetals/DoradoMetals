// What an order is worth.
//
// Every scrap branch here used to read `item.premium` on its own while every
// product branch fell back to the row's own premium - `item.premium ??
// item?.product?.bid_premium ?? 0`. That asymmetry was an oversight, not a
// rule, and it valued a scrap line at zero whenever its premium was null.
//
// It was found by comparing the two PDFs a customer receives. Purchase order
// 239 in dev holds one troy ounce of gold with a null premium and a scrap
// bid_premium of 0.75: the invoice, which uses calculateTotalPrice, put the
// order at $4,744.11, and the packing list, which had its own copy of the sum
// with the fallback, put it at $7,980.22. The gold was worth $3,236.11 and the
// invoice said nothing.
//
// calculateReturnDeclaredValue is the worse one - it is the declared value on a
// return shipment, so the same item would have been posted back uninsured.
//
// No production order changes: of 81 scrap lines in production, zero have a
// null premium. This can only ever have understated, never overstated.
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
        (item?.scrap?.content ?? 0) * (spot.bid_spot * (item.premium ?? item?.scrap?.bid_premium ?? 0));
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
        (item?.scrap?.content ?? 0) * (spot.bid_spot * (item.premium ?? item?.scrap?.bid_premium ?? 0));
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
      (item?.scrap.content ?? 0) * (spot.bid_spot * (item.premium ?? item?.scrap?.bid_premium ?? 0))
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
      (item?.scrap?.content ?? 0) * (spot.bid_spot * (item.premium ?? item?.scrap?.bid_premium ?? 0));
    return acc + price;
  }, 0);
}
