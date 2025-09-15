import express from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { getAll } from '../controllers/carriersController.js';

const router = express.Router();

router.get('/get_all', requireAdmin, getAll);

export default router;
