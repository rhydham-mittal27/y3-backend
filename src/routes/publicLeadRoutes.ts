import { Router } from 'express';
import { createPublicParentLead } from '../controllers/publicLeadController';
import { createPublicParentLeadValidation } from '../validators/publicLeadValidator';

const router = Router();

router.post('/parent', createPublicParentLeadValidation, createPublicParentLead);

export default router;
