import express from 'express';
import {
  getSpotPrices,
} from '#transport/spots/controller.ts';

const router = express.Router();

// NO WIRE ADAPTER. Spots is the second CONVERTED feature (2026-08-27): the
// frontend types derive from @dorado/contracts and read the schema's own
// names - `name` / `ask` / `bid` - so there is no legacy shape left to
// convert down to. The one conversion that survives is INTERNAL: the order
// calculations still price with the legacy names, and
// features/spots/legacy-shape.ts covers them until orders converts.

router.get('/spot_prices', getSpotPrices);

export default router;
