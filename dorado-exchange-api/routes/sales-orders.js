import express from 'express';
import { requireUser, requireAdmin } from '../middleware/authMiddleware.js';
import {
  createSalesOrder,
  getSalesOrders,
  getOrderMetals,
  getAllSalesOrders,
  sendOrderToSupplier,
  updateOrderTracking,
  updateStatus,
  adminCreateSalesOrder,
  createReview,
} from '../controllers/salesOrderController.js';

const router = express.Router();

// user
router.post('/create_sales_order', requireUser, createSalesOrder);
router.get('/get_sales_orders', requireUser, getSalesOrders);
router.post('/get_order_metals', requireUser, getOrderMetals);
router.post('/create_review', requireUser, createReview);

// admin
router.get('/get_all', requireAdmin, getAllSalesOrders);
router.post('/update_status', requireAdmin, updateStatus);
router.post('/send_order_to_supplier', requireAdmin, sendOrderToSupplier);
router.post('/update_tracking', requireAdmin, updateOrderTracking);
router.post('/admin_create_sales_order', requireAdmin, adminCreateSalesOrder);

export default router;
