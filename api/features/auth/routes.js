import express from 'express';

import { setPassword } from '#features/auth/controller.ts';
import { requireAuth } from '#shared/middleware/authMiddleware.js';

const router = express.Router();

router.post('/set_password', requireAuth, setPassword);

export default router;
