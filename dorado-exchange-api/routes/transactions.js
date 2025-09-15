import express from 'express';
import { requireUser } from '../middleware/authMiddleware.js';
import { getTransactionHistory } from '../controllers/transactionController.js';

const router = express.Router();

router.get('/get_transactions', requireUser, getTransactionHistory);

export default router;