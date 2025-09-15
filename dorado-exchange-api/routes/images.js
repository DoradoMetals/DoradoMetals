import express from 'express';
import { requireUser } from '../middleware/authMiddleware.js';
import {
  uploadImage,
  getUrl,
  deleteImage,
  getTestImages,
} from '../controllers/imageController.js';

const router = express.Router();

router.post('/upload', requireUser, uploadImage);
router.get('/get_test_image', requireUser, getTestImages);
router.get('/get_url', requireUser, getUrl);
router.delete('/delete', requireUser, deleteImage);

export default router;
