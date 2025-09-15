import express from 'express';
import {
  getAddresses,
  createAndUpdateAddress,
  deleteAddress,
  setDefaultAddress,
} from '../controllers/addressController.js';
import { requireUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/get_addresses', requireUser, getAddresses);
router.post('/create_and_update_address', requireUser, createAndUpdateAddress);
router.delete('/delete_address', requireUser, deleteAddress);
router.post('/set_default_address', requireUser, setDefaultAddress);

export default router;
