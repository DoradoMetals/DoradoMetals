import express from 'express';
import {
  getSpotPrices,
  updateScrapPercentages,
} from '#features/spots/controller.js';

const router = express.Router();

router.get('/spot_prices', getSpotPrices);
router.post('/update_scrap_percentage', updateScrapPercentages);

export default router;
