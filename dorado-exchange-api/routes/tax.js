import express from 'express';
import { requireUser } from '../middleware/authMiddleware.js';
import { getSalesTax } from '../controllers/taxController.js';

const router = express.Router();

router.post('/get_sales_tax', requireUser, getSalesTax);

export default router;