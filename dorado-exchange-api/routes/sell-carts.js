import express from 'express';
import { getSellCart, syncSellCart } from '../controllers/sellCartController.js';

const router = express.Router();

router.get('/get_sell_cart', getSellCart);
router.post('/sync_sell_cart', syncSellCart);

export default router;
