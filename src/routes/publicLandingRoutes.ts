import { Router } from 'express';
import { createLandingParentLead, createLandingTutorApplication } from '../controllers/publicLandingController';

const router = Router();

router.post('/parent-demo', createLandingParentLead);
router.post('/tutor-application', createLandingTutorApplication);

export default router;
