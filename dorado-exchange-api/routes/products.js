import express from 'express';
import {
  getAllProducts,
  getHomepageProducts,
  getFilteredProducts,
  getProductFromSlug,
  getSellProducts,
} from '../controllers/productsController.js';

const router = express.Router();

router.get('/get_all_products', getAllProducts);
router.get('/get_sell_products', getSellProducts);
router.get('/get_homepage_products', getHomepageProducts);
router.get('/get_products', getFilteredProducts);
router.get('/get_product_from_slug', getProductFromSlug);

export default router;
