import express from 'express';
import { getAllSuppliers } from '../controllers/supplierController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/get_all', requireAdmin, getAllSuppliers);

export default router;
