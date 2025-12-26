import express from 'express';
import { verifyRecaptcha } from "#features/recaptcha/controller.js";

const router = express.Router();

router.post('/verify-recaptcha', verifyRecaptcha);

export default router;
