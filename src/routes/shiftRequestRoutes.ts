import { Router } from 'express';
import protect from '../middlewares/auth';
import {
  createShiftRequestHandler,
  approveShiftRequestHandler,
  rejectShiftRequestHandler,
  getByClassHandler,
  getPendingForCoordinatorHandler,
  getForTutorHandler,
} from '../controllers/shiftRequestController';

const router = Router();

router.use(protect);

router.post('/', createShiftRequestHandler);
router.get('/coordinator/pending', getPendingForCoordinatorHandler);
router.get('/tutor/mine', getForTutorHandler);
router.get('/class/:classId', getByClassHandler);
router.put('/:id/approve', approveShiftRequestHandler);
router.put('/:id/reject', rejectShiftRequestHandler);

export default router;
