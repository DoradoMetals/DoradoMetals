import express from 'express';
import {
  getSpotPrices,
} from '#transport/spots/controller.ts';

const router = express.Router();

// No wire adapter - the frontend reads the schema's own names (`name` / `ask` / `bid`) directly.

router.get('/spot_prices', getSpotPrices);

export default router;
