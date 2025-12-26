import { Router } from 'express';
import { getOptionsController, createOptionController, updateOptionController, deleteOptionController, getOptionTypesController } from '../controllers/optionController';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

// Public read endpoints
router.get('/types', getOptionTypesController);
router.get('/:type', getOptionsController);

// Admin-only management endpoints
router.post('/', protect, authorize(USER_ROLES.ADMIN), createOptionController);
router.put('/:id', protect, authorize(USER_ROLES.ADMIN), updateOptionController);
router.delete('/:id', protect, authorize(USER_ROLES.ADMIN), deleteOptionController);

export default router;
