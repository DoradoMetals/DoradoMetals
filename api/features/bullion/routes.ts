import { Router } from 'express';
import { BullionController } from './controller';
import { requireAdmin } from '@/shared/middleware/auth';

const router = Router();
const controller = new BullionController();

router.get('/get_all', controller.getAll);
router.get('/get_sellable', controller.getSellable);
router.get('/get_homepage', controller.getHomepage);
router.get('/get_from_slug', controller.getFromSlug);
router.get('/get_filtered', controller.getFiltered);

router.get('/get_admin_all', requireAdmin, controller.getAdminAll);
router.post('/create', requireAdmin, controller.create);
router.post('/update', requireAdmin, controller.update);

export default router;
