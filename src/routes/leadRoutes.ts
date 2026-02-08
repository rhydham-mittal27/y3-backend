import { Router } from 'express';
import {
  createLead,
  getLeads,
  getLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  getMyLeads,
  getTutorLeads,
  getFilterOptions,
  getCRMLeads,
  reassignLead,
} from '../controllers/leadController';
import { createLeadValidation, updateLeadValidation, updateStatusValidation, leadIdValidation } from '../validators/leadValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { requireManagerPermissions } from '../middlewares/managerPermissions';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post(
  '/',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  requireManagerPermissions('canCreateLeads'),
  createLeadValidation,
  createLead
);

router.get(
  '/',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  getLeads
);

router.get(
  '/my-leads',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN),
  getMyLeads
);
router.get('/tutor/my-leads', authorize(USER_ROLES.TUTOR), getTutorLeads);
router.get('/filter-options', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getFilterOptions);
router.get('/crm', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getCRMLeads);
router.get('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), leadIdValidation, getLead);
router.put('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateLeadValidation, updateLead);
router.patch('/:id/status', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updateStatusValidation, updateLeadStatus);
router.patch('/:id/reassign', authorize(USER_ROLES.ADMIN), reassignLead);
router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), leadIdValidation, deleteLead);

export default router;
