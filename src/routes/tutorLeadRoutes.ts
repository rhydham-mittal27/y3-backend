import { Router } from 'express';
import { createTutorLeadRegistrationController } from '../controllers/tutorLeadController';

const router = Router();

// Public endpoint for tutor self-registration (no auth)
router.post('/', createTutorLeadRegistrationController);

export default router;
