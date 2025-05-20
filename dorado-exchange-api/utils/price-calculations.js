function calculateTotalPrice(order, spots) {
  const baseTotal = order.order_items.reduce((acc, item) => {
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

  const shipping = order.shipment?.shipping_charge ?? 0;

  let payoutFee = 0;
  if (order.payout.method === "WIRE") {
    payoutFee = 20;
  }

  return baseTotal - shipping - payoutFee;
}

function calculateItemPrice(item, spots) {
  if (item.item_type === "product") {
    const spot = spots?.find((s) => s.type === item.product?.metal_type);
    return (
      (item?.product.content ?? 0) *
      (spot.bid_spot * (item.bullion_premium ?? item?.product.bid_premium ?? 0))
    );
  } else if (item.item_type === "scrap") {
    const spot = spots?.find((s) => s.type === item.scrap?.metal);
    return (item?.scrap.content ?? 0) * (spot.bid_spot * spot.scrap_percentage);
  }
}

module.exports = {
  calculateTotalPrice,
  calculateItemPrice,
};
