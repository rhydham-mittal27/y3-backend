import { Router } from 'express';
import {
  postAnnouncement,
  getAnnouncements,
  getTutorAvailableAnnouncementsController,
  getAnnouncement,
  getAnnouncementByLead,
  expressInterestInAnnouncement,
  getInterestedTutorsForAnnouncement,
  getRecommendedTutorsForLeadController,
  deactivateAnnouncementController,
  getMyExpressedInterestsController,
} from '../controllers/announcementController';
import {
  sendCoordinatorAnnouncementController,
  getCoordinatorAnnouncementsController,
  getCoordinatorAnnouncementController,
  getCoordinatorAnnouncementStatsController,
  sendAdminBroadcastController,
  getBroadcastHistoryController,
  deleteBroadcastLogController,
} from '../controllers/announcementController';
import {
  postAnnouncementValidation,
  expressInterestValidation,
  announcementIdValidation,
  leadIdValidation,
  sendCoordinatorAnnouncementValidation,
  coordinatorAnnouncementIdValidation,
} from '../validators/announcementValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.post('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), postAnnouncementValidation, postAnnouncement);
router.get('/', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR), getAnnouncements);
router.get(
  '/tutor/available',
  authorize(USER_ROLES.TUTOR),
  getTutorAvailableAnnouncementsController
);
router.get('/lead/:leadId', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), leadIdValidation, getAnnouncementByLead);
router.get('/tutor/my-interests', authorize(USER_ROLES.TUTOR), getMyExpressedInterestsController);
router.get('/:id', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.TUTOR), announcementIdValidation, getAnnouncement);
router.post('/:id/interest', authorize(USER_ROLES.TUTOR), expressInterestValidation, expressInterestInAnnouncement);
router.get('/:id/interested-tutors', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), announcementIdValidation, getInterestedTutorsForAnnouncement);
router.get('/:id/recommended-tutors', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), announcementIdValidation, getRecommendedTutorsForLeadController);
router.patch('/:id/deactivate', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), announcementIdValidation, deactivateAnnouncementController);

// Admin broadcast push notification
router.post('/admin/broadcast', authorize(USER_ROLES.ADMIN), sendAdminBroadcastController);
router.get('/admin/broadcast/history', authorize(USER_ROLES.ADMIN), getBroadcastHistoryController);
router.delete('/admin/broadcast/:logId', authorize(USER_ROLES.ADMIN), deleteBroadcastLogController);

// Coordinator announcement routes
router.post(
  '/coordinator',
  authorize(USER_ROLES.COORDINATOR),
  sendCoordinatorAnnouncementValidation,
  sendCoordinatorAnnouncementController
);

router.get('/coordinator', authorize(USER_ROLES.COORDINATOR), getCoordinatorAnnouncementsController);
router.get('/coordinator/stats', authorize(USER_ROLES.COORDINATOR), getCoordinatorAnnouncementStatsController);
router.get(
  '/coordinator/:id',
  authorize(USER_ROLES.COORDINATOR),
  coordinatorAnnouncementIdValidation,
  getCoordinatorAnnouncementController
);

export default router;
