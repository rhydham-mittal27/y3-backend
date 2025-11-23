import { Router } from 'express';
import { getPreferences, updatePreferences, resetPreferences, deletePreferences } from '../controllers/settingsController';
import { updatePreferencesValidation } from '../validators/settingsValidator';
import protect from '../middlewares/auth';

const router = Router();

router.get('/preferences', protect, getPreferences);
router.put('/preferences', protect, updatePreferencesValidation, updatePreferences);
router.post('/preferences/reset', protect, resetPreferences);
router.delete('/preferences', protect, deletePreferences);

export default router;
