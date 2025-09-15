import express from 'express';

import { requireAdmin } from '../middleware/authMiddleware.js';
import {
  getAll,
  getUser,
  getAdmins,
  updateCredit,
} from '../controllers/usersController.js';

const router = express.Router();

router.get('/get_user', requireAdmin, getUser);
router.get('/get_all_users', requireAdmin, getAll);
router.get('/get_admin_users', requireAdmin, getAdmins);
router.post('/update_credit', requireAdmin, updateCredit);

export default router;
