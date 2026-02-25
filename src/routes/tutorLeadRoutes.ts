import { Router } from 'express';
import { createTutorLeadRegistrationController, createTutorLeadOtpLaterController } from '../controllers/tutorLeadController';

const router = Router();

// Public endpoint for tutor self-registration (no auth)
router.post('/', createTutorLeadRegistrationController);

// Public endpoint for landing: create tutor profile and send login OTP (email-based)
router.post('/otp-later', createTutorLeadOtpLaterController);

export default router;
