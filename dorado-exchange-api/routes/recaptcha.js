import express from 'express';
import { verifyRecaptcha } from '../controllers/recaptchaController.js';

const router = express.Router();

router.post('/verify-recaptcha', verifyRecaptcha);

export default router;
