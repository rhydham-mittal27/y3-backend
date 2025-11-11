import { Router } from 'express';
import {
  createLead,
  getLeads,
  getLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  getMyLeads,
} from '../controllers/leadController';
import { createLeadValidation, updateLeadValidation, updateStatusValidation, leadIdValidation } from '../validators/leadValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), createLeadValidation, createLead);
router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getLeads);
router.get('/my-leads', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getMyLeads);
router.get('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), leadIdValidation, getLead);
router.put('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateLeadValidation, updateLead);
router.patch('/:id/status', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateStatusValidation, updateLeadStatus);
router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), leadIdValidation, deleteLead);

export default router;
