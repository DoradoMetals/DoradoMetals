import express from 'express';
import { requireUser } from '../middleware/authMiddleware.js';
import { createReview } from '../controllers/reviewController.js';

const router = express.Router();

router.post('/create_review', requireUser, createReview);

export default router;
