import express from 'express';
import { protect } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import * as classPlanController from '../controllers/classPlanController';

const router = express.Router();

// Apply protection to all routes
router.use(protect);
router.use(authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER));

router.route('/')
  .post(classPlanController.createOrUpdatePlan);

router.route('/:classId')
  .get(classPlanController.getPlanByClassId);

router.route('/plan/:id') // Changed path to avoid conflict if we use :id on root
  .patch(classPlanController.updatePlan);

export default router;
