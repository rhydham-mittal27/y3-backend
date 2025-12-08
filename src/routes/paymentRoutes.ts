import { Router } from 'express';
import {
  createPaymentRecord,
  getPayments,
  getPayment,
  updatePaymentStatusController,
  updatePaymentRecord,
  deletePaymentRecord,
  getTutorPayments,
  getClassPayments,
  getPaymentStats,
  exportPaymentsCSV,
  exportPaymentsPDF,
  sendReminderController,
  getMyPaymentSummary,
  downloadPaymentReceipt,
  getMyPaymentsForParent,
  generateAdvancePaymentForClass,
} from '../controllers/paymentController';
import {
  createPaymentValidation,
  updatePaymentStatusValidation,
  updatePaymentValidation,
  paymentIdValidation,
  tutorIdParamValidation,
  classIdParamValidation,
  sendPaymentReminderValidation,
} from '../validators/paymentValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), createPaymentValidation, createPaymentRecord);
router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getPayments);
router.get('/statistics', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getPaymentStats);
router.get('/export/csv', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), exportPaymentsCSV);
router.get('/export/pdf', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), exportPaymentsPDF);
router.get('/tutor/:tutorId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR), tutorIdParamValidation, getTutorPayments);
router.get(
  '/tutor/summary',
  authorize(USER_ROLES.TUTOR),
  getMyPaymentSummary
);
router.get(
  '/parent/my-payments',
  authorize(USER_ROLES.PARENT),
  getMyPaymentsForParent
);
router.get(
  '/class/:classId',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR, USER_ROLES.PARENT),
  classIdParamValidation,
  getClassPayments
);
router.post(
  '/class/:classId/advance',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.COORDINATOR),
  classIdParamValidation,
  generateAdvancePaymentForClass
);
router.get(
  '/:id/receipt',
  authorize(USER_ROLES.TUTOR),
  paymentIdValidation,
  downloadPaymentReceipt
);
router.get(
  '/:id',
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR, USER_ROLES.PARENT),
  paymentIdValidation,
  getPayment
);
router.put('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), updatePaymentValidation, updatePaymentRecord);
router.delete('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), paymentIdValidation, deletePaymentRecord);
router.patch(
  '/:id/status', 
  authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.PARENT, USER_ROLES.STUDENT), 
  updatePaymentStatusValidation, 
  updatePaymentStatusController
);
router.post('/:id/send-reminder', authorize(USER_ROLES.COORDINATOR, USER_ROLES.MANAGER, USER_ROLES.ADMIN), sendPaymentReminderValidation, sendReminderController);

export default router;
