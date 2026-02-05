import { Router } from 'express';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';
import { uploadDocument } from '../middlewares/fileUpload';
import { getNotesController, getTutorNotesController, getParentNotesController, createFolderController, uploadNoteFileController } from '../controllers/noteController';
import { createFolderValidation, uploadNoteFileValidation } from '../validators/noteValidator';

const router = Router();

router.use(protect);

router.get('/', authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.COORDINATOR, USER_ROLES.PARENT), getNotesController);

router.get(
  '/tutor-notes',
  authorize(USER_ROLES.TUTOR),
  getTutorNotesController
);

router.get(
  '/parent/my-notes',
  authorize(USER_ROLES.PARENT),
  getParentNotesController
);

router.post(
  '/folders',
  authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.COORDINATOR),
  createFolderValidation,
  createFolderController
);

router.post(
  '/files',
  authorize(USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.COORDINATOR),
  uploadDocument,
  uploadNoteFileValidation,
  uploadNoteFileController
);

export default router;
