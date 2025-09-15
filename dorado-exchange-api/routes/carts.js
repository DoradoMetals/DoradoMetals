import express from 'express';
import { getCart, syncCart } from '../controllers/cartController.js';

const router = express.Router();

router.get('/get_cart', getCart);
router.post('/sync_cart', syncCart);

export default router;
