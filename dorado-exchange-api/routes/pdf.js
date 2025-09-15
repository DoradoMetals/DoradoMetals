import express from 'express';
import { requireUser } from '../middleware/authMiddleware.js';
import {
  generatePackingList,
  generateReturnPackingList,
  generateInvoice,
  generateSalesOrderInvoice,
} from '../controllers/pdfController.js';

const router = express.Router();

router.post('/generate_packing_list', requireUser, generatePackingList);
router.post('/generate_return_packing_list', requireUser, generateReturnPackingList);
router.post('/generate_invoice', requireUser, generateInvoice);
router.post('/generate_sales_order_invoice', requireUser, generateSalesOrderInvoice);

export default router;
