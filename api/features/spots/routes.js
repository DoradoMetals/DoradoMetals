import express from 'express';
import {
  getSpotPrices,
} from '#features/spots/controller.js';

import * as spotsWire from "#features/spots/wire.js";
import { wireShape } from "#shared/wire/middleware.js";

const router = express.Router();

// The wire adapter, mounted once for the whole feature rather than called by
// hand in every handler - no writes take this entity, so only the response is converted. Controllers return the internal shape
// and know nothing about the frontend not having caught up. Deleting the
// adapter is deleting this line.
router.use(wireShape(spotsWire, { body: false }));

router.get('/spot_prices', getSpotPrices);

export default router;
