import express from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import {
  getAllProducts,
  getAllMetals,
  getAllSuppliers,
  getAllMints,
  getAllTypes,
  saveProduct,
  deleteProduct,
  createProduct,
  getInventory,
} from '../controllers/admin/adminProductsController.js';
import { getAllScrap } from '../controllers/admin/adminScrapController.js';

const router = express.Router();

// products
router.get('/get_products', requireAdmin, getAllProducts);
router.get('/get_metals', requireAdmin, getAllMetals);
router.get('/get_suppliers', requireAdmin, getAllSuppliers);
router.get('/get_mints', requireAdmin, getAllMints);
router.get('/get_product_types', requireAdmin, getAllTypes);
router.post('/save_product', requireAdmin, saveProduct);
router.post('/create_product', requireAdmin, createProduct);
router.post('/delete_product', requireAdmin, deleteProduct);
router.get('/get_inventory', requireAdmin, getInventory);

// scrap
router.get('/get_scrap', requireAdmin, getAllScrap);

export default router;
