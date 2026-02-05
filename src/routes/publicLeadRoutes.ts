import { Router } from 'express';
import { createPublicParentLead, getPublicLead } from '../controllers/publicLeadController';
import { createPublicParentLeadValidation } from '../validators/publicLeadValidator';

const router = Router();

router.post('/parent', createPublicParentLeadValidation, createPublicParentLead);
router.get('/:id', getPublicLead);


export default router;
