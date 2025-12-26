import express from 'express';

import {
  getAll,
  getUser,
  getAdmins,
  updateCredit,
} from "#features/users/controller.js"

import { requireAdmin } from '#shared/middleware/authMiddleware.js';

const router = express.Router();

router.get('/get_user', requireAdmin, getUser);
router.get('/get_all_users', requireAdmin, getAll);
router.get('/get_admin_users', requireAdmin, getAdmins);
router.post('/update_credit', requireAdmin, updateCredit);

export default router;
