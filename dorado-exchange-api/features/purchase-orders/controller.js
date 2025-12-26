import * as purchaseOrderService from "#features/purchase-orders/service.js"

export async function getPurchaseOrderById(req, res) {
  try {
    const orderId = req.params.id;
    const order = await purchaseOrderService.getById(orderId);
    return res.json(order);
  } catch (err) {
    return next(err);
  }
}

export async function getPurchaseOrders(req, res, next) {
  try {
    const userId = req.user.id;
    const orders = await purchaseOrderService.listOrdersForUser(userId);
    return res.json(orders);
  } catch (err) {
    return next(err);
  }
}

export async function getAllPurchaseOrders(req, res, next) {
  try {
    const orders = await purchaseOrderService.getAll();
    return res.json(orders);
  } catch (err) {
    return next(err);
  }
}

export async function getPurchaseOrderMetals(req, res, next) {
  try {
    const { purchase_order_id } = req.body;
    const metals = await purchaseOrderService.getMetalsForOrder(
      purchase_order_id
    );
    return res.json(metals);
  } catch (err) {
    return next(err);
  }
}

export async function acceptOffer(req, res, next) {
  try {
    const { order, order_spots, spot_prices } = req.body;
    const { purchaseOrder, orderSpots } =
      await purchaseOrderService.acceptOffer({
        order,
        order_spots,
        spot_prices,
      });
    return res.status(200).json({
      purchaseOrder: purchaseOrder,
      orderSpots: orderSpots,
    });
  } catch (err) {
    return next(err);
  }
}

export async function rejectOffer(req, res, next) {
  try {
    const { order, offer_notes } = req.body;
    const updated = await purchaseOrderService.rejectOffer({
      orderId: order.id,
      offerNotes: offer_notes,
    });
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    const { order, return_shipment } = req.body;
    const result = await purchaseOrderService.cancelOrder({
      order,
      return_shipment,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function updateOfferNotes(req, res, next) {
  try {
    const { order, offer_notes } = req.body;
    const result = await purchaseOrderService.updateOfferNotes({
      order,
      offer_notes,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function createReview(req, res, next) {
  try {
    const result = await purchaseOrderService.createReview(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function createPurchaseOrder(req, res, next) {
  try {
    const { purchase_order, user_id } = req.body;
    const order = await purchaseOrderService.createPurchaseOrder(
      purchase_order,
      user_id
    );
    return res.status(200).json(order);
  } catch (err) {
    return next(err);
  }
}

export async function sendOffer(req, res, next) {
  try {
    await purchaseOrderService.sendOffer(req.body);
    const updated = await purchaseOrderService.updateStatus(req.body);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

export async function updateRejectedOffer(req, res, next) {
  try {
    await purchaseOrderService.sendOffer(req.body);
    const updated = await purchaseOrderService.updateStatus(req.body);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateStatus(req.body);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

export async function updateScrapPercentage(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateScrap(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function resetScrapPercentage(req, res, next) {
  try {
    const updated = await purchaseOrderService.resetScrap(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateSpot(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateSpot(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function lockSpots(req, res, next) {
  try {
    const updated = await purchaseOrderService.lockSpots(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function unlockSpots(req, res, next) {
  try {
    const updated = await purchaseOrderService.unlockSpots(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function saveOrderItems(req, res, next) {
  try {
    const updated = await purchaseOrderService.toggleOrderItemStatus({
      item_status: true,
      ids: req.body.ids,
      purchase_order_id: req.body.purchase_order_id,
    });
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function resetOrderItems(req, res, next) {
  try {
    const updated = await purchaseOrderService.toggleOrderItemStatus({
      item_status: false,
      ids: [req.body.id],
      purchase_order_id: req.body.purchase_order_id,
    });
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function deleteOrderItems(req, res, next) {
  try {
    const updated = await purchaseOrderService.deleteOrderItems(req.body);

    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateScrapItem(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateScrapItem(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function createOrderItem(req, res, next) {
  try {
    const updated = await purchaseOrderService.createOrderItem(req.body);

    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateBullion(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateBullion(req.body);

    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function expireStaleOffers(req, res, next) {
  try {
    await purchaseOrderService.expireStaleOffers();
  } catch (err) {
    return next(err);
  }
}

export async function editShippingCharge(req, res, next) {
  try {
    await purchaseOrderService.editShippingCharge(req.body);
  } catch (err) {
    return next(err);
  }
}

export async function editPayoutCharge(req, res, next) {
  try {
    await purchaseOrderService.editPayoutCharge(req.body);
  } catch (err) {
    return next(err);
  }
}

export async function changePayoutMethod(req, res, next) {
  try {
    await purchaseOrderService.changePayoutMethod(req.body);
  } catch (err) {
    return next(err);
  }
}

export async function addFundsToAccount(req, res, next) {
  try {
    await purchaseOrderService.addFundsToAccount(req.body);
  } catch (err) {
    return next(err);
  }
}

export async function purgeCancelled(req, res, next) {
  try {
    await purchaseOrderService.purgeCancelled();
  } catch (err) {
    return next(err);
  }
}

export async function getPurchaseOrderRefinerMetals(req, res, next) {
  try {
    const { purchase_order_id } = req.body;
    const metals = await purchaseOrderService.getRefinerMetalsForOrder(
      purchase_order_id
    );
    return res.json(metals);
  } catch (err) {
    return next(err);
  }
}

export async function updateRefinerScrapPercentage(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateRefinerScrap(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function resetRefinerScrapPercentage(req, res, next) {
  try {
    const updated = await purchaseOrderService.resetRefinerScrap(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateRefinerSpot(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateRefinerSpot(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateRefinerPremium(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateRefinerPremium(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateShippingActual(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateShippingActual(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateRefinerFee(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateRefinerFee(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updatePoolOzDeducted(req, res, next) {
  try {
    const updated = await purchaseOrderService.updatePoolOzDeducted(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

export async function updatePoolRemediation(req, res, next) {
  try {
    const updated = await purchaseOrderService.updatePoolRemediation(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}


