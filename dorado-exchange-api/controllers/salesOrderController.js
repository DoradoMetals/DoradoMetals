const salesOrderService = require("../services/salesOrderService");

async function getSalesOrderById(req, res) {
  try {
    const orderId = req.params.id;
    const order = await salesOrderService.getById(orderId);
    return res.json(order);
  } catch (err) {
    return next(err);
  }
}

async function getSalesOrders(req, res, next) {
  try {
    const userId = req.user.id;
    const orders = await salesOrderService.listOrdersForUser(userId);
    return res.json(orders);
  } catch (err) {
    return next(err);
  }
}

async function getAllSalesOrders(req, res, next) {
  try {
    const orders = await salesOrderService.getAll();
    return res.json(orders);
  } catch (err) {
    return next(err);
  }
}

async function getOrderMetals(req, res, next) {
  try {
    const { sales_order_id } = req.body;
    const metals = await salesOrderService.getMetalsForOrder(sales_order_id);
    return res.json(metals);
  } catch (err) {
    return next(err);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const result = await salesOrderService.cancelOrder(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function createReview(req, res, next) {
  try {
    const result = await salesOrderService.createReview(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function createSalesOrder(req, res, next) {
  try {
    const order = await salesOrderService.createSalesOrder(
      req.body,
      req.headers
    );
    return res.status(200).json(order);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSalesOrderById,
  getSalesOrders,
  getAllSalesOrders,
  getOrderMetals,
  cancelOrder,
  createReview,
  createSalesOrder,
};
