const purchaseOrderService = require("../services/purchaseOrderService");

async function getPurchaseOrderById(req, res) {
  try {
    const orderId = req.params.id;
    const order = await purchaseOrderService.getById(orderId);
    return res.json(order);
  } catch (err) {
    return next(err);
  }
}

async function getPurchaseOrders(req, res, next) {
  try {
    const userId = req.user.id;
    const orders = await purchaseOrderService.listOrdersForUser(userId);
    return res.json(orders);
  } catch (err) {
    return next(err);
  }
}

async function getAllPurchaseOrders(req, res, next) {
  try {
    const orders = await purchaseOrderService.getAll();
    return res.json(orders);
  } catch (err) {
    return next(err);
  }
}

async function getPurchaseOrderMetals(req, res, next) {
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

async function acceptOffer(req, res, next) {
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

async function rejectOffer(req, res, next) {
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

async function cancelOrder(req, res, next) {
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

async function updateOfferNotes(req, res, next) {
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

async function createReview(req, res, next) {
  try {
    const { order } = req.body;
    const result = await purchaseOrderService.createReview({
      order,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function createPurchaseOrder(req, res, next) {
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

async function sendOffer(req, res, next) {
  try {
    await purchaseOrderService.sendOffer(req.body);
    const updated = await purchaseOrderService.updateStatus(req.body);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function updateRejectedOffer(req, res, next) {
  try {
    await purchaseOrderService.sendOffer(req.body);
    const updated = await purchaseOrderService.updateStatus(req.body);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateStatus(req.body);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function updateScrapPercentage(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateScrap(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

async function resetScrapPercentage(req, res, next) {
  try {
    const updated = await purchaseOrderService.resetScrap(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

async function updateSpot(req, res, next) {
  try {
    const updated = await purchaseOrderService.updateSpot(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

async function lockSpots(req, res, next) {
  try {
    const updated = await purchaseOrderService.lockSpots(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

async function unlockSpots(req, res, next) {
  try {
    const updated = await purchaseOrderService.unlockSpots(req.body);
    return res.status(200).json({ updated });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPurchaseOrderById,
  getPurchaseOrders,
  getAllPurchaseOrders,
  getPurchaseOrderMetals,
  acceptOffer,
  rejectOffer,
  updateOfferNotes,
  cancelOrder,
  createReview,
  createPurchaseOrder,
  sendOffer,
  updateRejectedOffer,
  updateStatus,
  updateScrapPercentage,
  resetScrapPercentage,
  updateSpot,
  lockSpots,
  unlockSpots,
};
