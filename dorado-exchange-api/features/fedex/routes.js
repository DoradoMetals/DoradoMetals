import express from 'express';


import {
  validateAddress,
  getFedexRates,
  createFedexLabel,
  cancelLabel,
  scheduleFedexPickup,
  checkFedexPickupAvailability,
  cancelFedexPickup,
  getFedexLocations,
} from "#features/fedex/controller.js";

import { getTracking } from '#features/shipping/controller.js';

import { requireUser } from "#shared/middleware/authMiddleware.js";


const router = express.Router();

// FedEx
router.get('/validate_address', requireUser, validateAddress);
router.post('/get_fedex_rates', requireUser, getFedexRates);
router.post('/create_fedex_label', requireUser, createFedexLabel);
router.post('/cancel_fedex_label', requireUser, cancelLabel);
router.post('/check_fedex_pickup_times', requireUser, checkFedexPickupAvailability);
router.post('/schedule_fedex_pickup', requireUser, scheduleFedexPickup);
router.post('/cancel_fedex_pickup', requireUser, cancelFedexPickup);
router.post('/get_fedex_locations', requireUser, getFedexLocations);

// Shipping
router.post('/get_tracking', requireUser, getTracking);

export default router;
