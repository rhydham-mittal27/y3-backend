import { Router } from 'express';
import { registerParentLead } from '../controllers/parentLeadController';
import { createParentLeadValidation } from '../validators/parentLeadValidator';

const router = Router();

// POST /api/v1/parent-leads  — public, no auth (sales lead capture)
router.post('/', createParentLeadValidation, registerParentLead);

export default router;
