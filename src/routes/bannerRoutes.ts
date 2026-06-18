import { Router } from 'express';
import { protect } from '../middlewares/auth';
import { uploadDocument } from '../middlewares/fileUpload';
import {
  createBanner,
  getActiveBannersForTutor,
  getBanners,
  deleteBanner,
} from '../controllers/bannerController';

const router = Router();

router.use(protect);

// Tutor: get banners visible to them
router.get('/active', getActiveBannersForTutor);

// Admin / Coordinator: list all (own) banners
router.get('/', getBanners);

// Admin / Coordinator: create banner with image upload
router.post('/', uploadDocument, createBanner);

// Admin / Coordinator: deactivate banner
router.delete('/:id', deleteBanner);

export default router;
